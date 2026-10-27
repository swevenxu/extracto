"use client";

import { useEffect, useState } from "react";

export function GoogleSheetsSettings() {
  const [connected, setConnected] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");

  useEffect(() => {
    fetch("/api/google/me").then((response) => response.ok ? response.json() : null)
      .then((data) => setConnected(Boolean(data?.connected))).catch(() => setConnected(false));
  }, []);

  async function disconnect() {
    setBusy(true); setMessage(""); setSpreadsheetUrl("");
    try {
      const response = await fetch("/api/google/disconnect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect Google");
      setConnected(false); setMessage("Google account disconnected.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not disconnect Google"); }
    finally { setBusy(false); }
  }

  async function exportToSheets() {
    setBusy(true); setMessage(""); setSpreadsheetUrl("");
    try {
      const response = await fetch("/api/export/sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spreadsheetId: spreadsheetId.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Export failed");
      setMessage(`Exported ${data.updatedRows} rows to Google Sheets.`); setSpreadsheetUrl(data.spreadsheetUrl || "");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(false); }
  }

  return <section className="surface grid gap-4 p-5" aria-labelledby="sheets-heading">
    <div><h2 id="sheets-heading">Google Sheets</h2><p className="mt-1 text-sm text-muted">Export reviewed documents to a spreadsheet you choose.</p></div>
    <div className="flex flex-wrap gap-2">{connected ? <button type="button" disabled={busy} onClick={disconnect} className="btn-secondary">{busy ? "Working…" : "Disconnect Google"}</button> : <form action="/api/google/connect" method="get"><button type="submit" className="btn-secondary">Connect Google</button></form>}</div>
    {connected && <div className="flex flex-col gap-2 sm:flex-row"><label className="visually-hidden" htmlFor="spreadsheet-id">Google spreadsheet ID</label><input id="spreadsheet-id" value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} placeholder="Paste spreadsheet ID" className="field-control min-w-0 flex-1" /><button type="button" disabled={busy || !spreadsheetId.trim()} onClick={exportToSheets} className="btn-primary">{busy ? "Exporting…" : "Export reviewed data"}</button></div>}
    {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
    {spreadsheetUrl && <a href={spreadsheetUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline">Open spreadsheet</a>}
    <p className="text-xs text-muted">Export writes reviewed rows starting at cell A1 in the selected sheet.</p>
  </section>;
}
