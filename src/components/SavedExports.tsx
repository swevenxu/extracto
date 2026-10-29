"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExportMode, ExportPreset } from "@/lib/types";
import { EXPORT_FIELDS, defaultMapping } from "@/lib/sheetsExport";

interface Draft {
  id?: string;
  name: string;
  spreadsheetId: string;
  mode: ExportMode;
  sheetName: string;
  mapping: Record<string, string>;
}

const emptyDraft = (): Draft => ({
  name: "",
  spreadsheetId: "",
  mode: "append",
  sheetName: "",
  mapping: defaultMapping(),
});

const modeSummary = (preset: ExportPreset) =>
  preset.mode === "new_sheet"
    ? `New tab: ${preset.sheetName || "named on export"}`
    : "Appends to the first tab";

export function SavedExports() {
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (): Promise<ExportPreset[]> => {
    const res = await fetch("/api/export/presets");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load saved exports");
    return data.presets ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    request()
      .then((presets) => { if (!cancelled) setPresets(presets); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load saved exports"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [request]);

  async function refresh() {
    try {
      setPresets(await request());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load saved exports");
    }
  }

  function startCreate() {
    setDraft(emptyDraft());
    setMessage("");
    setError("");
  }

  function startEdit(preset: ExportPreset) {
    setDraft({
      id: preset.id,
      name: preset.name,
      spreadsheetId: preset.spreadsheetId,
      mode: preset.mode,
      sheetName: preset.sheetName ?? "",
      mapping: { ...preset.mapping },
    });
    setMessage("");
    setError("");
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/export/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          spreadsheetId: draft.spreadsheetId,
          mode: draft.mode,
          sheetName: draft.mode === "new_sheet" ? draft.sheetName : undefined,
          mapping: draft.mapping,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save export");
      setDraft(null);
      setMessage(`Saved “${data.preset?.name ?? draft.name}”.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save export");
    } finally {
      setBusy(false);
    }
  }

  async function remove(preset: ExportPreset) {
    if (!window.confirm(`Delete saved export “${preset.name}”?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/export/presets?id=${encodeURIComponent(preset.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete export");
      setMessage(`Deleted “${preset.name}”.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete export");
    } finally {
      setBusy(false);
    }
  }

  const setMapping = (field: string, raw: string) => {
    if (!draft) return;
    const letter = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    const next = { ...draft.mapping };
    if (letter) next[field] = letter;
    else delete next[field];
    setDraft({ ...draft, mapping: next });
  };

  return (
    <section className="surface grid gap-5 p-5" aria-labelledby="saved-exports-heading">
      <div className="section-heading">
        <div>
          <h2 id="saved-exports-heading">Saved exports</h2>
          <p className="mt-1 text-sm text-muted">Reuse a column mapping and destination instead of setting it up each time.</p>
        </div>
        {!draft && <button type="button" className="btn-secondary" onClick={startCreate} disabled={loading}>New saved export</button>}
      </div>

      {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading && <p className="text-sm text-muted" aria-busy="true">Loading saved exports…</p>}

      {!loading && presets.length === 0 && !draft && (
        <div className="grid gap-1 border-t border-rule pt-4">
          <p className="font-medium text-ink">No saved exports yet</p>
          <p className="text-sm text-muted">Save one to get a one-click export with your column order and tab behaviour.</p>
        </div>
      )}

      {!loading && presets.length > 0 && (
        <ul className="grid gap-2">
          {presets.map((preset) => (
            <li key={preset.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium text-ink">{preset.name}</p>
                <p className="font-outlier text-xs text-ink-2">{preset.spreadsheetId}</p>
                <p className="text-xs text-muted">
                  {modeSummary(preset)}, {Object.keys(preset.mapping).length} columns
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="btn-quiet" onClick={() => startEdit(preset)} disabled={busy}>Edit</button>
                <button type="button" className="btn-quiet text-error hover:bg-error/10" onClick={() => remove(preset)} disabled={busy}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <form
          className="grid gap-4 border-t border-rule pt-4"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="field-label">Name</span>
              <input
                className="field-control"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={60}
                placeholder="Monthly ledger"
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="field-label">Spreadsheet ID or URL</span>
              <input
                className="field-control"
                value={draft.spreadsheetId}
                onChange={(e) => setDraft({ ...draft, spreadsheetId: e.target.value })}
                placeholder="Paste spreadsheet ID or URL"
                required
              />
            </label>
          </div>

          <fieldset className="grid gap-2">
            <legend className="field-label">When exporting</legend>
            <label className="flex items-start gap-2 text-sm text-ink-2">
              <input
                type="radio"
                name="export-mode"
                className="mt-1"
                checked={draft.mode === "append"}
                onChange={() => setDraft({ ...draft, mode: "append" })}
              />
              <span>
                <span className="font-medium text-ink">Append rows</span>
                <span className="block text-xs text-muted">Continue under the last used row of the first tab.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink-2">
              <input
                type="radio"
                name="export-mode"
                className="mt-1"
                checked={draft.mode === "new_sheet"}
                onChange={() => setDraft({ ...draft, mode: "new_sheet" })}
              />
              <span>
                <span className="font-medium text-ink">Start a new sheet</span>
                <span className="block text-xs text-muted">Add a tab and write the header plus every reviewed row.</span>
              </span>
            </label>
            {draft.mode === "new_sheet" && (
              <label className="grid gap-1 sm:max-w-sm">
                <span className="field-label">Tab name (optional)</span>
                <input
                  className="field-control"
                  value={draft.sheetName}
                  onChange={(e) => setDraft({ ...draft, sheetName: e.target.value })}
                  placeholder="Extracto 2026-10-28 11-42-07"
                  maxLength={100}
                />
              </label>
            )}
          </fieldset>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="field-label mb-0">Columns</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{Object.keys(draft.mapping).length} of {EXPORT_FIELDS.length} mapped</span>
                <button type="button" className="btn-quiet" onClick={() => setDraft({ ...draft, mapping: defaultMapping() })}>Default order</button>
                <button type="button" className="btn-quiet" onClick={() => setDraft({ ...draft, mapping: {} })}>Clear</button>
              </div>
            </div>
            <p className="text-xs text-muted">Enter a column letter for each field, or leave it blank to skip the field.</p>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {EXPORT_FIELDS.map((field) => (
                <label key={field} className="grid gap-1">
                  <span className="truncate text-xs text-muted" title={field}>{field}</span>
                  <input
                    className="field-control w-full rounded font-outlier uppercase"
                    value={draft.mapping[field] ?? ""}
                    onChange={(e) => setMapping(field, e.target.value)}
                    maxLength={3}
                    placeholder="—"
                    aria-label={`Column letter for ${field}`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save export"}</button>
            <button type="button" className="btn-secondary" onClick={() => { setDraft(null); setError(""); }} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
