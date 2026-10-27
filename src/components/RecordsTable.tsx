"use client";

import type { ExtractedRecord } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

type RecordsTableProps = { initialRecords: ExtractedRecord[] };

export function RecordsTable({ initialRecords }: RecordsTableProps) {
  const [records, setRecords] = useState<ExtractedRecord[]>(initialRecords);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/records");
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data = (await res.json()) as { records: ExtractedRecord[] };
      setRecords(data.records);
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
      <p className="font-medium text-ink">No documents yet</p>
      <p className="text-sm text-muted">Upload an invoice or receipt to create your review queue.</p>
      <Link href="/upload" className="btn-secondary">Upload your first document</Link>
    </div>
  );

  const isProcessing = (r: ExtractedRecord) => r.status === "processing" || r.status === "extracted";

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="records-table data-table min-w-[900px]">
          <colgroup><col className="w-[39%]" /><col className="w-[20%]" /><col className="w-[10%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[12%]" /></colgroup>
          <thead><tr><th>Document</th><th>Invoice number</th><th>Date</th><th className="text-right">Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{records.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/record/${r.id}`} className="font-medium text-ink hover:text-accent">{r.fileName}</Link>
                {r.vendor && <span className="mt-1 block text-xs text-muted">{r.vendor}</span>}
              </td>
              <td className="font-outlier text-cool">{r.invoiceNumber || "—"}</td>
              <td className="font-figure tabular-nums text-cool">{r.issueDate || "—"}</td>
              <td className="num text-right">{formatCurrency(r.total, r.currency)}</td>
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
          ))}</tbody>
        </table>
      </div>
      <div className="grid gap-2 sm:hidden">
        {records.map((r) => (
          <Link key={r.id} href={`/record/${r.id}`} className="surface grid gap-3 p-4 no-underline hover:bg-paper-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 break-words font-medium text-ink">{r.fileName}{r.vendor ? <span className="mt-1 block text-sm font-normal text-muted">{r.vendor}</span> : null}</span>
              <span className="status-chip shrink-0" data-status={r.status}>{r.status}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-muted">Invoice</dt><dd className="font-outlier text-cool">{r.invoiceNumber || "—"}</dd></div>
              <div><dt className="text-muted">Date</dt><dd className="font-figure tabular-nums text-cool">{r.issueDate || "—"}</dd></div>
              <div><dt className="text-muted">Total</dt><dd className="font-figure tabular-nums text-cool">{formatCurrency(r.total, r.currency)}</dd></div>
            </dl>
            {r.status === "failed" && r.extractionError && <p className="text-sm text-error">{r.extractionError}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
