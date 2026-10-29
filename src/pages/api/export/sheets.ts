import type { NextApiRequest, NextApiResponse } from "next";
import { google } from "googleapis";
import { currentUserFromCookie } from "@/lib/session";
import { getActiveWorkspace, getExportPreset, listRecordsByWorkspace, getRecord } from "@/lib/storage";
import { recordRows } from "@/lib/csv";
import {
  appendStartRow,
  buildSheetRows,
  columnLetter,
  defaultMapping,
  isExportMode,
  normalizeMapping,
  sanitizeSheetTitle,
  suggestedSheetTitle,
} from "@/lib/sheetsExport";
import type { DocumentRecord, ExportMode } from "@/lib/types";
import { getTokensForUser, makeClient, deleteTokensForUser } from "@/lib/google";

/**
 * Export reviewed documents to Google Sheets.
 *
 * POST body:
 *   - spreadsheetId: string — spreadsheet ID or URL (falls back to the saved export)
 *   - presetId?: string — saved export providing spreadsheet, mapping and mode
 *   - mapping?: Record<string, string> — export field → column letter
 *   - mode?: "append" | "new_sheet"
 *        append    → continue under the last used row of the first tab
 *        new_sheet → add a new tab and write the header plus rows
 *   - sheetName?: string — tab name for new_sheet (generated when empty)
 *   - recordIds?: string[] — optional; defaults to every reviewed record
 *
 * Returns { updatedRows, spreadsheetUrl, sheetUrl?, sheetName, mode, startRow }.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  const { presetId, mapping: mappingInput, mode: modeInput, sheetName: sheetNameInput, recordIds } = body as {
    presetId?: string;
    mapping?: unknown;
    mode?: unknown;
    sheetName?: string;
    recordIds?: string[];
  };

  const preset = typeof presetId === "string" && presetId ? getExportPreset(presetId, user.id) : undefined;
  if (presetId && !preset) {
    res.status(404).json({ error: "Saved export not found" });
    return;
  }

  const spreadsheetId =
    typeof body.spreadsheetId === "string" && body.spreadsheetId.trim()
      ? body.spreadsheetId.trim()
      : preset?.spreadsheetId;
  if (!spreadsheetId) {
    res.status(400).json({ error: "spreadsheetId is required" });
    return;
  }

  let mapping: Record<string, string>;
  try {
    mapping = normalizeMapping(mappingInput ?? preset?.mapping ?? defaultMapping());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid column mapping" });
    return;
  }

  const mode: ExportMode = isExportMode(modeInput) ? modeInput : preset?.mode ?? "append";
  const sheetName = typeof sheetNameInput === "string" && sheetNameInput.trim() ? sheetNameInput.trim() : preset?.sheetName;

  // Load tokens (auto-refreshes if near expiry)
  const tokens = await getTokensForUser(user.id);
  if (!tokens) {
    res.status(400).json({
      error: "Google account not connected or token revoked. Reconnect via /api/google/connect",
    });
    return;
  }

  // Exports cover the workspace the member is currently in.
  const workspace = getActiveWorkspace(user);
  let records: DocumentRecord[];
  if (Array.isArray(recordIds) && recordIds.length > 0) {
    records = recordIds
      .map((id) => getRecord(id, workspace.id))
      .filter((record): record is DocumentRecord => !!record);
  } else {
    records = listRecordsByWorkspace(workspace.id).filter((record) => record.status === "reviewed");
  }
  records = records.filter((record) => record.status === "reviewed");

  if (records.length === 0) {
    res.status(400).json({ error: "No reviewed records to export" });
    return;
  }

  const { header, data, columnCount } = buildSheetRows(records.flatMap(recordRows), mapping);
  const lastColumn = columnLetter(columnCount - 1);
  const quote = (title: string) => `'${title.replace(/'/g, "''")}'`;

  try {
    const client = makeClient();
    client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: client });

    let sheetTitle: string;
    let sheetId: number | undefined;
    let startRow: number;
    let includeHeader: boolean;

    if (mode === "new_sheet") {
      sheetTitle = sanitizeSheetTitle(sheetName || suggestedSheetTitle()) || suggestedSheetTitle();
      const created = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
      });
      const replies = created.data.replies as
        | Array<{ addSheet?: { properties?: { sheetId?: number } } }>
        | undefined;
      sheetId = replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
      startRow = 1;
      includeHeader = true;
    } else {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title,sheetId)" });
      const first = (meta.data.sheets ?? [])[0]?.properties;
      sheetTitle = first?.title || "Sheet1";
      sheetId = first?.sheetId ?? undefined;

      // Count the rows already used so the export continues underneath them.
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${quote(sheetTitle)}!A1:${lastColumn}10000`,
      });
      const usedRows = existing.data.values?.length ?? 0;
      ({ startRow, includeHeader } = appendStartRow(usedRows));
    }

    const values = includeHeader ? [header, ...data] : data;
    const endRow = startRow + values.length - 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${quote(sheetTitle)}!A${startRow}:${lastColumn}${endRow}`,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    res.status(200).json({
      updatedRows: data.length,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      sheetUrl: sheetId !== undefined
        ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`
        : undefined,
      sheetName: sheetTitle,
      mode,
      startRow,
      columns: columnCount,
    });
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
    const googleMessage = e.response?.data?.error?.message || e.message || "Sheets API error";

    // 401/403 = token invalid/revoked
    if (e.response?.status === 401 || e.response?.status === 403) {
      await deleteTokensForUser(user.id);
      res.status(401).json({
        error: "Google token revoked or expired. Please reconnect.",
      });
      return;
    }

    // A duplicate tab name is the one user-fixable failure worth naming.
    if (/already exists/i.test(googleMessage)) {
      res.status(409).json({ error: "A tab with that name already exists in this spreadsheet. Choose another name." });
      return;
    }

    console.error("Sheets export error:", err);
    res.status(500).json({ error: `Sheets API error: ${googleMessage}` });
  }
}
