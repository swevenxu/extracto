"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEvent, ExtractedRecord, WorkspaceMemberView } from "@/lib/types";
import {
  DOC_TYPES,
  PRESETS,
  presetFor,
  type DocType,
  type FieldDef,
  type FieldValue,
  type RowColumnDef,
} from "@/lib/docTypes";
import { updateRecord } from "@/lib/api";
import { findTextOffset } from "@/lib/utils";

const asText = (value: FieldValue | undefined) => (value === undefined || value === null ? "" : String(value));

const toNumber = (value: string | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toTextMap = (source: Record<string, FieldValue> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(source ?? {}).map(([key, value]) => [key, asText(value)]));

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `field-${field.key}`;
  const numeric = field.kind === "number";
  const onFocus = () => document.dispatchEvent(new CustomEvent("field-focus", { detail: field.key }));
  return (
    <div className={field.wide ? "field field-wide" : "field"}>
      <label className="field-label" htmlFor={id}>{field.label}</label>
      <input
        id={id}
        type={numeric ? "number" : "text"}
        step={numeric ? "0.01" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className={`field-control${numeric ? " font-figure tabular-nums" : ""}`}
      />
    </div>
  );
}

interface ReviewFormProps {
  record: ExtractedRecord;
  retryAction: (id: string) => Promise<ExtractedRecord>;
  members: WorkspaceMemberView[];
  activity: ActivityEvent[];
  currentUserId: string;
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ReviewForm({ record, retryAction, members, activity, currentUserId }: ReviewFormProps) {
  const [docType, setDocType] = useState<DocType>(record.docType);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => toTextMap(record.fields));
  const [rows, setRows] = useState<Record<string, string>[]>(() => (record.rows ?? []).map(toTextMap));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pulse, setPulse] = useState<string | null>(null);
  const [status, setStatus] = useState(record.status);
  const [assigneeId, setAssigneeId] = useState(record.assigneeId ?? "");
  const [events, setEvents] = useState<ActivityEvent[]>(activity);
  const [assigning, setAssigning] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [sourceMissing, setSourceMissing] = useState(!record.fileUrl);
  const sourceRef = useRef<HTMLDivElement>(null);

  const preset = presetFor(docType);

  const setField = (key: string, value: string) =>
    setFieldValues((current) => ({ ...current, [key]: value }));

  /**
   * Switching presets only changes which fields and columns are shown: row values
   * stay in place, so switching back restores them (saving sends the visible ones).
   */
  const changeType = (next: DocType) => {
    if (next === docType) return;
    setDocType(next);
    setSaved(false);
  };

  // Values to trace back to the source text: readable fields, then each row's lead value.
  const traced: { id: string; value: string }[] = [
    ...preset.fields
      .filter((field) => field.kind !== "number")
      .map((field) => ({ id: field.key, value: fieldValues[field.key] ?? "" })),
    ...rows.map((row, index) => ({
      id: `row-${index}`,
      value: preset.rowColumns[0]?.key === "date" ? row.date ?? row.description ?? "" : row.description ?? "",
    })),
  ];

  // Highlight the matching <mark> in the source viewer when a field is focused.
  useEffect(() => {
    const listener = (e: CustomEvent) => {
      const detail = String(e.detail ?? "");
      setHighlight(detail);
      if (!detail) return;
      const el = document.getElementById(`src-${detail}`);
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setPulse(detail); setTimeout(() => setPulse(null), 1200); }
    };
    document.addEventListener("field-focus", listener as EventListener);
    return () => document.removeEventListener("field-focus", listener as EventListener);
  }, [record.rawText]);

  // The bytes live beside the record: when they are gone, the viewer would print the
  // API's JSON error into the pane, so check first and show a state instead.
  useEffect(() => {
    if (!record.fileUrl) return;
    const controller = new AbortController();
    let cancelled = false;
    fetch(record.fileUrl, { signal: controller.signal })
      .then((res) => {
        const type = res.headers.get("content-type") ?? "";
        if (!cancelled && (!res.ok || type.includes("application/json"))) setSourceMissing(true);
        controller.abort();
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) setSourceMissing(true);
      });
    return () => { cancelled = true; controller.abort(); };
  }, [record.fileUrl]);

  const patchRow = (index: number, key: string, value: string) =>
    setRows((current) => current.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)));

  const refreshActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/records/${record.id}/activity`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      /* history is best-effort */
    }
  }, [record.id]);

  const assign = async (value: string) => {
    setAssigning(true);
    setError(null);
    try {
      const updated = await updateRecord(record.id, { assigneeId: value || null });
      setAssigneeId(updated.assigneeId ?? "");
      await refreshActivity();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign reviewer");
    } finally {
      setAssigning(false);
    }
  };

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const updated = await updateRecord(record.id, {
        docType,
        fields: Object.fromEntries(
          preset.fields.map((field) => [
            field.key,
            field.kind === "number" ? toNumber(fieldValues[field.key]) : fieldValues[field.key] ?? "",
          ])
        ),
        rows: rows.map((row) =>
          Object.fromEntries(
            preset.rowColumns.map((column) => [
              column.key,
              column.kind === "number" ? toNumber(row[column.key]) : row[column.key] ?? "",
            ])
          )
        ),
        status: "reviewed",
      });
      setDocType(updated.docType);
      setFieldValues(toTextMap(updated.fields));
      setRows((updated.rows ?? []).map(toTextMap));
      setStatus(updated.status);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      await refreshActivity();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const fmt = (n: number) => {
    const currency = fieldValues.currency || "USD";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  };

  /** Wrap each traced value in <mark id="src-{id}"> for click-jump, scanning on so repeated values (two dates) each get their own line. */
  const renderHighlighted = () => {
    if (!record.rawText) return null;
    const matches: { idx: number; len: number; id: string }[] = [];
    const taken = new Map<string, number>();
    for (const { id, value } of traced.filter((t) => t.value.trim().length > 1)) {
      const start = taken.get(value) ?? 0;
      const idx = findTextOffset(record.rawText.slice(start), value);
      if (idx < 0) continue;
      matches.push({ idx: start + idx, len: value.length, id });
      taken.set(value, start + idx + value.length);
    }
    matches.sort((a, b) => a.idx - b.idx);
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const m of matches) {
      if (m.idx < last) continue;
      if (m.idx > last) parts.push(record.rawText.slice(last, m.idx));
      parts.push(<mark key={m.id} id={`src-${m.id}`} className={`hl-mark${pulse === m.id ? " hl-pulse" : ""}`}>{record.rawText.slice(m.idx, m.idx + m.len)}</mark>);
      last = m.idx + m.len;
    }
    if (last < record.rawText.length) parts.push(record.rawText.slice(last));
    return parts;
  };

  const rowCell = (column: RowColumnDef, row: Record<string, string>, index: number) => {
    const id = `row-${column.key}-${index}`;
    const numeric = column.kind === "number";
    return (
      <td key={column.key} className="py-2 pl-2" data-col={column.label}>
        <label className="visually-hidden" htmlFor={id}>{`Row ${index + 1} ${column.label.toLowerCase()}`}</label>
        <input
          id={id}
          type={numeric ? "number" : "text"}
          step={numeric ? "0.01" : undefined}
          value={row[column.key] ?? ""}
          onChange={(e) => patchRow(index, column.key, e.target.value)}
          onFocus={column.key === preset.rowColumns[0]?.key ? () => document.dispatchEvent(new CustomEvent("field-focus", { detail: `row-${index}` })) : undefined}
          className={`field-control${numeric ? " min-w-24 rounded text-right" : " min-w-40 rounded"}`}
        />
      </td>
    );
  };

  return <section className="review-sheet" aria-label="Review extracted document">
    <header className="review-bar">
      <div className="review-id">
        <p className="review-kicker">Source document</p>
        <p className="review-file">{record.fileName}</p>
      </div>
      <div className="review-bar-actions flex-wrap">
        <label className="review-type">
          <span className="review-kicker">Document type</span>
          <select
            value={docType}
            onChange={(e) => changeType(e.target.value as DocType)}
            className="field-control field-control-select"
            aria-label="Document type"
          >
            {DOC_TYPES.map((type) => <option key={type} value={type}>{PRESETS[type].label}</option>)}
          </select>
        </label>
        <label className="review-type">
          <span className="review-kicker">Reviewer</span>
          <select
            value={assigneeId}
            onChange={(e) => void assign(e.target.value)}
            className="field-control field-control-select"
            aria-label="Assigned reviewer"
            disabled={assigning}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}{member.userId === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="status-chip" data-status={status}>{status}</span>
      </div>
    </header>
    <p className="review-kicker mt-3">{preset.description}</p>
    {record.demoMode && <p className="review-flag">Demo extraction: check the fields against the source before saving.</p>}
    {status === "processing" && <p role="status" className="review-flag">Extraction is in progress…</p>}
    {status === "failed" && <div className="review-flag" data-tone="error" role="alert">
      <p className="review-flag-title">Extraction failed</p>
      {record.extractionError && <p className="review-flag-body">{record.extractionError}</p>}
      <button type="button" onClick={() => retryAction(record.id).then(() => window.location.reload())} className="btn-secondary">Retry extraction</button>
    </div>}

    <div className="review-body">
      <div className="review-source" aria-label="Source document viewer">
        {record.fileUrl && (<div className="pdf-panel"><p className="pane-label">Original document</p>
          {sourceMissing
            ? <div className="pdf-missing"><p><strong>Original file not available</strong></p><p>The stored copy of this document is missing. The extracted text beside it is still available to review.</p></div>
            : <iframe title={`Original document: ${record.fileName}`} src={record.fileUrl} className="pdf-frame" tabIndex={-1} />}
        </div>)}
        {record.rawText && (<div className="source-panel"><p className="pane-label">Extracted text</p><div ref={sourceRef} className="source-text" data-highlight={highlight ?? ""}>{renderHighlighted()}</div></div>)}
      </div>

      <div className="review-fields">
        <div className="field-grid">
          {preset.fields.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={fieldValues[field.key] ?? ""}
              onChange={(value) => setField(field.key, value)}
            />
          ))}
        </div>
        <div className="review-actions">
          <p role="status" className={`review-note${error ? " is-error" : ""}`}>{error ?? (saved ? "Saved" : "")}</p>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>

    <section className="review-lines" aria-labelledby="row-heading">
      <div className="section-heading">
        <h2 id="row-heading">{preset.rowHeading}</h2>
        <button
          type="button"
          onClick={() => setRows((current) => [...current, Object.fromEntries(preset.rowColumns.map((column) => [column.key, ""]))])}
          className="btn-secondary"
        >
          {preset.addRowLabel}
        </button>
      </div>
      <div className="review-table-wrap">
        <table className="data-table review-table min-w-[650px]">
          <thead>
            <tr>
              {preset.rowColumns.map((column) => (
                <th key={column.key} className={column.kind === "number" ? "text-right" : undefined}>{column.label}</th>
              ))}
              <th><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={preset.rowColumns.length + 1} className="py-5 text-center text-muted">{preset.emptyRowLabel}</td></tr>}
            {rows.map((row, index) => (
              <tr key={`${record.id}-${index}`}>
                {preset.rowColumns.map((column) => rowCell(column, row, index))}
                <td className="py-2 pl-2 text-right">
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((_, idx) => idx !== index))}
                    className="btn-quiet"
                    aria-label={`Remove row ${index + 1}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="review-sum">
        {preset.rowTotalLabel}
        <span className="num">{fmt(rows.reduce((sum, row) => sum + toNumber(row.amount), 0))}</span>
      </p>
    </section>

    <section className="review-history" aria-labelledby="history-heading">
      <div className="section-heading">
        <h2 id="history-heading">History</h2>
        <span className="text-sm text-muted">{events.length} {events.length === 1 ? "event" : "events"}</span>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-muted">No changes recorded yet.</p>
      ) : (
        <ol className="history-list">
          {events.map((event) => (
            <li key={event.id} className="history-item">
              <div className="history-meta">
                <p className="text-sm text-ink">
                  <span className="font-medium">{event.actorName}</span>
                  {" · "}{event.summary}
                </p>
                <time className="text-xs text-muted" dateTime={event.at}>{formatWhen(event.at)}</time>
              </div>
              {event.changes?.length ? (
                <ul className="history-changes">
                  {event.changes.map((change, index) => (
                    <li key={`${event.id}-${index}`}>{change.field}: from {change.from || "empty"} to {change.to || "empty"}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  </section>;
}
