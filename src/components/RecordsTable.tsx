"use client";

import type { ExtractedRecord, WorkspaceMemberView } from "@/lib/types";
import { presetFor, recordAmount, recordCurrency, recordField } from "@/lib/docTypes";
import Link from "next/link";
import { useEffect, useState } from "react";

type RecordsTableProps = {
  initialRecords: ExtractedRecord[];
  members: WorkspaceMemberView[];
  currentUserId: string;
};

type AssigneeFilter = "all" | "mine" | "unassigned";

const FILTERS: { id: AssigneeFilter; label: string }[] = [
  { id: "all", label: "All documents" },
  { id: "mine", label: "Assigned to me" },
  { id: "unassigned", label: "Unassigned" },
];

export function RecordsTable({ initialRecords, members: initialMembers, currentUserId }: RecordsTableProps) {
  const [records, setRecords] = useState<ExtractedRecord[]>(initialRecords);
  const [members, setMembers] = useState<WorkspaceMemberView[]>(initialMembers);
  const [filter, setFilter] = useState<AssigneeFilter>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/records");
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data = (await res.json()) as { records: ExtractedRecord[]; members?: WorkspaceMemberView[] };
      setRecords(data.records);
      if (data.members) setMembers(data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, []);

  async function deleteRecord(id: string, fileName: string) {
    const confirmed = window.confirm(`Delete "${fileName}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/records/${id}/delete`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed with status ${res.status}`);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function formatCurrency(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  const assigneeName = (record: ExtractedRecord) =>
    members.find((member) => member.userId === record.assigneeId)?.name ?? null;

  if (error) return (
    <div className="surface flex flex-wrap items-center justify-between gap-4 p-5" role="alert">
      <div><p className="font-medium text-error">Could not load your documents</p><p className="mt-1 text-sm text-muted">{error}</p></div>
      <button type="button" onClick={refresh} className="btn-secondary">Try again</button>
    </div>
  );

  if (isRefreshing) return (
    <div className="space-y-0" aria-live="polite" aria-busy="true" aria-label="Loading documents">
      {[0, 1, 2].map((row) => <div key={row} className="h-[60px] border-b border-rule bg-paper-2/50" />)}
      <span className="sr-only">Loading documents…</span>
    </div>
  );

  if (records.length === 0) return (
    <div className="surface flex flex-col items-start gap-3 p-6">
      <p className="font-medium text-ink">No documents in this workspace yet</p>
      <p className="text-sm text-muted">Upload an invoice, receipt, or bank statement to create your review queue.</p>
      <Link href="/upload" className="btn-secondary">Upload your first document</Link>
    </div>
  );

  const isProcessing = (r: ExtractedRecord) => r.status === "processing" || r.status === "extracted";
  const mineCount = records.filter((record) => record.assigneeId === currentUserId).length;
  const unassignedCount = records.filter((record) => !record.assigneeId).length;
  const visible = records.filter((record) =>
    filter === "mine" ? record.assigneeId === currentUserId : filter === "unassigned" ? !record.assigneeId : true
  );

  return (
    <>
      <div className="assignment-filter" role="group" aria-label="Filter documents by assignee">
        {FILTERS.map((option) => {
          const count = option.id === "mine" ? mineCount : option.id === "unassigned" ? unassignedCount : records.length;
          return (
            <button
              key={option.id}
              type="button"
              className={filter === option.id ? "btn-secondary" : "btn-quiet"}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="surface p-6">
          <p className="font-medium text-ink">Nothing matches this filter</p>
          <p className="mt-1 text-sm text-muted">
            {filter === "mine" ? "No documents are assigned to you right now." : "Every document has a reviewer."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="records-table data-table min-w-[960px]">
              <thead><tr><th>Document</th><th>Reference</th><th>Date</th><th className="text-right">Amount</th><th>Assignee</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{visible.map((r) => {
                const preset = presetFor(r.docType);
                const subtitle = recordField(r, preset.subtitleKey);
                const reference = recordField(r, preset.referenceKey);
                const date = recordField(r, preset.dateKey);
                const assignee = assigneeName(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/record/${r.id}`} className="font-medium text-ink hover:text-accent">{r.fileName}</Link>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="status-chip">{preset.label}</span>
                        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
                      </span>
                    </td>
                    <td className="font-outlier text-ink-2">{reference || "—"}</td>
                    <td className="font-figure tabular-nums text-ink-2">{date || "—"}</td>
                    <td className="num text-right">{formatCurrency(recordAmount(r), recordCurrency(r))}</td>
                    <td>
                      {assignee
                        ? <span className="text-sm text-ink-2">{assignee}{r.assigneeId === currentUserId ? " (you)" : ""}</span>
                        : <span className="text-sm text-muted">Unassigned</span>}
                    </td>
                    <td><span className="status-chip" data-status={r.status}>{r.status}</span>{r.status === "failed" && r.extractionError && <span className="mt-1 block max-w-sm text-xs text-error">{r.extractionError}</span>}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isProcessing(r) && (
                          <button
                            type="button"
                            onClick={() => deleteRecord(r.id, r.fileName)}
                            disabled={deletingId === r.id}
                            className="btn-quiet text-error hover:bg-error/10"
                            aria-label={`Delete ${r.fileName}`}
                          >
                            {deletingId === r.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                        <Link href={`/record/${r.id}`} className="btn-quiet">{r.status === "processing" ? "View" : "Review"}</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="grid gap-2 sm:hidden">
            {visible.map((r) => {
              const preset = presetFor(r.docType);
              const subtitle = recordField(r, preset.subtitleKey);
              const assignee = assigneeName(r);
              return (
                <Link key={r.id} href={`/record/${r.id}`} className="surface grid gap-3 p-4 no-underline hover:bg-paper-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-medium text-ink">{r.fileName}{subtitle ? <span className="mt-1 block text-sm font-normal text-muted">{subtitle}</span> : null}</span>
                    <span className="status-chip shrink-0" data-status={r.status}>{r.status}</span>
                  </div>
                  <span className="status-chip w-fit">{preset.label}</span>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div><dt className="text-muted">{preset.referenceLabel}</dt><dd className="font-outlier text-ink-2">{recordField(r, preset.referenceKey) || "—"}</dd></div>
                    <div><dt className="text-muted">{preset.dateLabel}</dt><dd className="font-figure tabular-nums text-ink-2">{recordField(r, preset.dateKey) || "—"}</dd></div>
                    <div><dt className="text-muted">{preset.amountLabel}</dt><dd className="font-figure tabular-nums text-ink">{formatCurrency(recordAmount(r), recordCurrency(r))}</dd></div>
                    <div><dt className="text-muted">Assignee</dt><dd className="text-ink-2">{assignee ? `${assignee}${r.assigneeId === currentUserId ? " (you)" : ""}` : "Unassigned"}</dd></div>
                  </dl>
                  {r.status === "failed" && r.extractionError && <p className="text-sm text-error">{r.extractionError}</p>}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
