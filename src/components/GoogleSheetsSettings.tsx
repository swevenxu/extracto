"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ExportMode, ExportPreset } from "@/lib/types";

export function GoogleSheetsSettings() {
  const [connected, setConnected] = useState(false);
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [mode, setMode] = useState<ExportMode>("append");
  const [sheetName, setSheetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exportUrl, setExportUrl] = useState("");

  useEffect(() => {
    fetch("/api/google/me").then((response) => response.ok ? response.json() : null)
      .then((data) => setConnected(Boolean(data?.connected))).catch(() => setConnected(false));
    fetch("/api/export/presets").then((response) => response.ok ? response.json() : null)
      .then((data) => setPresets(data?.presets ?? [])).catch(() => setPresets([]));
  }, []);

  const selected = presets.find((preset) => preset.id === presetId);

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setSpreadsheetId(preset.spreadsheetId);
    setMode(preset.mode);
    setSheetName(preset.sheetName ?? "");
    setMessage("");
    setError("");
  }

  async function disconnect() {
    setBusy(true); setMessage(""); setError(""); setExportUrl("");
    try {
      const response = await fetch("/api/google/disconnect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect Google");
      setConnected(false); setMessage("Google account disconnected.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not disconnect Google"); }
    finally { setBusy(false); }
  }

  async function exportToSheets() {
    setBusy(true); setMessage(""); setError(""); setExportUrl("");
    try {
      const response = await fetch("/api/export/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: presetId || undefined,
          spreadsheetId: spreadsheetId.trim() || undefined,
          mode,
          sheetName: mode === "new_sheet" ? sheetName.trim() || undefined : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Export failed");
      setMessage(`Exported ${data.updatedRows} rows to “${data.sheetName}”.`);
      setExportUrl(data.sheetUrl || data.spreadsheetUrl || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(false); }
  }

  const canExport = Boolean(spreadsheetId.trim() || presetId) && !busy;

  return <section className="surface grid gap-4 p-5" aria-labelledby="sheets-heading">
    <div>
      <h2 id="sheets-heading">Google Sheets</h2>
      <p className="mt-1 text-sm text-muted">Export reviewed documents to a spreadsheet you choose.</p>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {connected ? <button type="button" disabled={busy} onClick={disconnect} className="btn-secondary">{busy ? "Working…" : "Disconnect Google"}</button> : <form action="/api/google/connect" method="get"><button type="submit" className="btn-secondary">Connect Google</button></form>}
      <Link href="/settings" className="btn-quiet">Manage saved exports</Link>
    </div>

    {connected && <div className="grid gap-3">
      {presets.length > 0 && (
        <label className="grid gap-1">
          <span className="field-label">Saved export</span>
          <select value={presetId} onChange={(e) => applyPreset(e.target.value)} className="field-control field-control-select">
            <option value="">None, use the settings below</option>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </label>
      )}

      <label className="grid gap-1">
        <span className="field-label">Spreadsheet ID or URL</span>
        <input
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
          placeholder="Paste spreadsheet ID or URL"
          className="field-control"
        />
      </label>

      <fieldset className="grid gap-1">
        <legend className="field-label">On export</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="radio" name="quick-export-mode" checked={mode === "append"} onChange={() => setMode("append")} />
            Append rows
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="radio" name="quick-export-mode" checked={mode === "new_sheet"} onChange={() => setMode("new_sheet")} />
            Start a new sheet
          </label>
        </div>
      </fieldset>

      {mode === "new_sheet" && (
        <label className="grid gap-1 sm:max-w-sm">
          <span className="field-label">Tab name (optional)</span>
          <input
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            placeholder="Extracto 2026-10-28 11-42-07"
            maxLength={100}
            className="field-control"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!canExport} onClick={exportToSheets} className="btn-primary">
          {busy ? "Exporting…" : "Export reviewed data"}
        </button>
        {selected && (
          <span className="text-xs text-muted">
            “{selected.name}”, {Object.keys(selected.mapping).length} columns
          </span>
        )}
      </div>
    </div>}

    {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    {exportUrl && <a href={exportUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline">Open spreadsheet</a>}

    <p className="text-xs text-muted">
      {mode === "append"
        ? "Append adds reviewed rows under the last used row of the first tab, keeping the existing header."
        : "New sheet adds a tab, writes the header, then writes every reviewed row below it."}
    </p>
  </section>;
}
