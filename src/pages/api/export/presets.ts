import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { deleteExportPreset, getExportPreset, listExportPresets, saveExportPreset } from "@/lib/storage";
import { extractSpreadsheetId, isExportMode, normalizeMapping, sanitizeSheetTitle } from "@/lib/sheetsExport";

/**
 * Saved spreadsheet exports.
 *
 * GET    → { presets }
 * POST   { id?, name, spreadsheetId, mapping, mode, sheetName? } → { preset }
 * DELETE ?id=… → { ok: true }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "GET") {
    res.status(200).json({ presets: listExportPresets(user.id) });
    return;
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) {
      res.status(400).json({ error: "Give this export a name" });
      return;
    }

    const spreadsheetId = typeof body.spreadsheetId === "string" ? extractSpreadsheetId(body.spreadsheetId).slice(0, 200) : "";
    if (!spreadsheetId) {
      res.status(400).json({ error: "Paste the spreadsheet ID or URL" });
      return;
    }

    let mapping: Record<string, string>;
    try {
      mapping = normalizeMapping(body.mapping);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid column mapping" });
      return;
    }

    const mode = isExportMode(body.mode) ? body.mode : "append";
    const sheetName =
      mode === "new_sheet" && typeof body.sheetName === "string" && body.sheetName.trim()
        ? sanitizeSheetTitle(body.sheetName)
        : undefined;

    if (typeof body.id === "string" && body.id && !getExportPreset(body.id, user.id)) {
      res.status(404).json({ error: "Saved export not found" });
      return;
    }

    try {
      const preset = saveExportPreset({
        id: typeof body.id === "string" && body.id ? body.id : undefined,
        userId: user.id,
        name,
        spreadsheetId,
        mapping,
        mode,
        sheetName,
      });
      res.status(200).json({ preset });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Could not save export" });
    }
    return;
  }

  if (req.method === "DELETE") {
    const id = String(req.query.id || "");
    if (!id) {
      res.status(400).json({ error: "Missing export id" });
      return;
    }
    const deleted = deleteExportPreset(id, user.id);
    res.status(deleted ? 200 : 404).json(deleted ? { ok: true } : { error: "Saved export not found" });
    return;
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}
