"use client";

import { useState } from "react";

export function DownloadCsvButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/export");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "CSV export failed");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "extracto-records.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "CSV export failed"); }
    finally { setBusy(false); }
  }

  return <div><button type="button" disabled={busy} onClick={download} className="btn-secondary">{busy ? "Preparing CSV…" : "Download reviewed CSV"}</button>{error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}</div>;
}
