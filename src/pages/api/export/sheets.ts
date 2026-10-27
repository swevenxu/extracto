import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { currentUserFromCookie } from "@/lib/session";
import {
  listRecordsByUser,
  getRecord,
} from "@/lib/storage";
import { CSV_HEADER, recordRows } from "@/lib/csv";
import type { DocumentRecord } from "@/lib/types";
import { getTokensForUser, makeClient, deleteTokensForUser } from "@/lib/google";

/**
 * Export reviewed documents to Google Sheets.
 *
 * POST body:
 *   - spreadsheetId: string — existing spreadsheet ID (user provides)
 *   - recordIds?: string[] — optional; if omitted, exports ALL reviewed
 *     records belonging to the user
 *   - mapping?: Record<string, string> — field->column letter mapping;
 *     defaults to sensible column order
 *
 * Requires the user to have connected their Google account via
 * `/api/google/connect` (tokens stored encrypted).
 *
 * Returns:
 *   - { updatedRows: number, spreadsheetUrl: string }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { spreadsheetId, recordIds, mapping } = body as {
    spreadsheetId?: string;
    recordIds?: string[];
    mapping?: Record<string, string | number>;
  };

  if (!spreadsheetId) {
    res.status(400).json({ error: "spreadsheetId is required" });
    return;
  }

  // Load tokens (auto-refreshes if near expiry)
  const tokens = await getTokensForUser(user.id);
  if (!tokens) {
    res.status(400).json({
      error: "Google account not connected or token revoked. Reconnect via /api/google/connect",
    });
    return;
  }

  // Determine which records to export
  let records: DocumentRecord[];
  if (recordIds && recordIds.length > 0) {
    records = (
      await Promise.all(recordIds.map((id) => getRecord(id, user.id)))
    ).filter((r): r is DocumentRecord => !!r);
  } else {
    // export all reviewed records for this user
    records = listRecordsByUser(user.id).filter((r) => r.status === "reviewed");
  }
  records = records.filter((record) => record.status === "reviewed");

  if (records.length === 0) {
    res.status(400).json({ error: "No reviewed records to export" });
    return;
  }

  const sourceRows = records.flatMap(recordRows);
  const fieldToCol: Record<string, number> = {};
  const provided: Record<string, string | number> = mapping ?? Object.fromEntries(CSV_HEADER.map((field, i) => [field, i]));
  for (const [field, colLetter] of Object.entries(provided)) {
    if (!CSV_HEADER.includes(field)) continue;
    if (typeof colLetter === "string" && /^[A-Z]+$/i.test(colLetter)) {
      let idx = 0;
      for (const ch of colLetter.toUpperCase()) {
        idx = idx * 26 + (ch.charCodeAt(0) - 64);
      }
      fieldToCol[field] = idx - 1;
    } else if (typeof colLetter === "number" && Number.isInteger(colLetter) && colLetter >= 0) {
      fieldToCol[field] = colLetter;
    }
  }
  if (Object.keys(fieldToCol).length === 0) { res.status(400).json({ error: "No valid field mappings provided" }); return; }

  const maxCol = Math.max(...Object.values(fieldToCol));
  if (maxCol > 999) { res.status(400).json({ error: "Column mapping is too far to the right" }); return; }
  const columnName = (index: number) => {
    let name = "";
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  };
  const header: (string | number)[] = Array(maxCol + 1).fill("");
  for (const [field, col] of Object.entries(fieldToCol)) header[col] = field;
  const values: (string | number)[][] = [header];
  for (const row of sourceRows) {
    const outRow: (string | number)[] = Array(maxCol + 1).fill("");
    for (let i = 0; i <= maxCol; i++) {
      const field = Object.keys(fieldToCol).find((f) => fieldToCol[f] === i);
      if (field !== undefined) outRow[i] = row[CSV_HEADER.indexOf(field)] ?? "";
    }
    values.push(outRow);
  }
  const range = `A1:${columnName(maxCol)}${values.length}`;

  try {
    const client = makeClient();
    client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: client });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    res.status(200).json({ updatedRows: sourceRows.length, spreadsheetUrl });
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
    // 401/403 = token invalid/revoked
    if (e.response?.status === 401 || e.response?.status === 403) {
      await deleteTokensForUser(user.id);
      res.status(401).json({
        error: "Google token revoked or expired. Please reconnect.",
      });
      return;
    }
    console.error("Sheets export error:", err);
    res.status(500).json({
      error: `Sheets API error: ${(err as Error).message}`,
    });
  }
}
