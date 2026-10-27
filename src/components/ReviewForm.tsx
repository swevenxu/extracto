"use client";

import { useState } from "react";
import type { ExtractedRecord, LineItem } from "@/lib/types";
import { updateRecord } from "@/lib/api";

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const numeric = type === "number" || /date/i.test(label);
  return <div><label className="field-label" htmlFor={id}>{label}</label><input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={`field-control${numeric ? " font-figure tabular-nums" : ""}`} /></div>;
}

interface ReviewFormProps { record: ExtractedRecord; retryAction: (id: string) => Promise<ExtractedRecord>; }

export default function ReviewForm({ record, retryAction }: ReviewFormProps) {
  const [vendor, setVendor] = useState(record.vendor ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(record.invoiceNumber ?? "");
  const [issueDate, setIssueDate] = useState(record.issueDate ?? "");
  const [dueDate, setDueDate] = useState(record.dueDate ?? "");
  const [currency, setCurrency] = useState(record.currency);
  const [subtotal, setSubtotal] = useState(String(record.subtotal));
  const [tax, setTax] = useState(String(record.tax));
  const [total, setTotal] = useState(String(record.total));
  const [lineItems, setLineItems] = useState<LineItem[]>(record.lineItems ?? []);
  const [showSource, setShowSource] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const patchLine = (i: number, field: keyof LineItem, value: string | number) => setLineItems((items) => items.map((li, idx) => idx === i ? { ...li, [field]: value } : li));
  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const updated = await updateRecord(record.id, { vendor, invoiceNumber, issueDate, dueDate, currency, subtotal: Number(subtotal), tax: Number(tax), total: Number(total), lineItems, status: "reviewed" });
      setVendor(updated.vendor ?? ""); setInvoiceNumber(updated.invoiceNumber ?? ""); setSubtotal(String(updated.subtotal)); setTax(String(updated.tax)); setTotal(String(updated.total)); setLineItems(updated.lineItems ?? []);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: record.currency || "USD", maximumFractionDigits: 2 }).format(n);

  return <section className="surface grid gap-6 p-4 sm:p-6" aria-label="Review extracted document">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
      <div className="min-w-0"><p className="text-sm text-muted">Source document</p><p className="mt-1 break-all font-outlier text-sm text-cool">{record.fileName}</p></div>
      <span className="status-chip" data-status={record.status}>{record.status}</span>
    </header>
    {record.demoMode && <p className="text-sm text-accent">Demo extraction: check the fields against the source before saving.</p>}
    {record.status === "processing" && <p role="status" className="surface p-4 text-sm text-accent">Extraction is in progress…</p>}
    {record.status === "failed" && <div className="surface grid justify-items-start gap-3 p-4" role="alert"><div><p className="font-medium text-error">Extraction failed</p>{record.extractionError && <p className="mt-1 text-sm text-muted">{record.extractionError}</p>}</div><button type="button" onClick={() => retryAction(record.id).then(() => window.location.reload())} className="btn-secondary">Retry extraction</button>{error && <p className="text-sm text-error">{error}</p>}</div>}

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Vendor" value={vendor} onChange={setVendor} />
      <Field label="Invoice number" value={invoiceNumber} onChange={setInvoiceNumber} />
      <Field label="Issue date" value={issueDate} onChange={setIssueDate} />
      <Field label="Due date" value={dueDate} onChange={setDueDate} />
      <Field label="Currency" value={currency} onChange={setCurrency} />
      <Field label="Subtotal" value={subtotal} onChange={setSubtotal} type="number" />
      <Field label="Tax" value={tax} onChange={setTax} type="number" />
      <Field label="Total" value={total} onChange={setTotal} type="number" />
    </div>

    <section aria-labelledby="line-items-heading">
      <div className="section-heading"><h2 id="line-items-heading">Line items</h2><button type="button" onClick={() => setLineItems((items) => [...items, { description: "", quantity: 0, unitPrice: 0, amount: 0 }])} className="btn-secondary">Add line item</button></div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[650px]"><thead><tr><th>Description</th><th className="text-right">Quantity</th><th className="text-right">Unit price</th><th className="text-right">Amount</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>
          {lineItems.length === 0 && <tr><td colSpan={5} className="py-5 text-center text-muted">No line items. Add one above.</td></tr>}
          {lineItems.map((li, i) => <tr key={`${record.id}-${i}`}>
            <td className="py-2 pr-3"><label className="visually-hidden" htmlFor={`line-description-${i}`}>Line ${i + 1} description</label><input id={`line-description-${i}`} value={li.description ?? ""} onChange={(e) => patchLine(i, "description", e.target.value)} className="field-control min-w-48 rounded" /></td>
            <td className="py-2 pl-2"><label className="visually-hidden" htmlFor={`line-quantity-${i}`}>Line ${i + 1} quantity</label><input id={`line-quantity-${i}`} type="number" min={0} step="0.01" value={li.quantity ?? 0} onChange={(e) => patchLine(i, "quantity", Number(e.target.value))} className="field-control min-w-24 rounded text-right" /></td>
            <td className="py-2 pl-2"><label className="visually-hidden" htmlFor={`line-price-${i}`}>Line ${i + 1} unit price</label><input id={`line-price-${i}`} type="number" min={0} step="0.01" value={li.unitPrice ?? 0} onChange={(e) => patchLine(i, "unitPrice", Number(e.target.value))} className="field-control min-w-24 rounded text-right" /></td>
            <td className="py-2 pl-2"><label className="visually-hidden" htmlFor={`line-amount-${i}`}>Line ${i + 1} amount</label><input id={`line-amount-${i}`} type="number" min={0} step="0.01" value={li.amount ?? 0} onChange={(e) => patchLine(i, "amount", Number(e.target.value))} className="field-control min-w-24 rounded text-right" /></td>
            <td className="py-2 pl-2 text-right"><button type="button" onClick={() => setLineItems((items) => items.filter((_, idx) => idx !== i))} className="btn-quiet" aria-label={`Remove line ${i + 1}`}>Remove</button></td>
          </tr>)}
        </tbody></table>
      </div>
      <p className="mt-2 text-sm text-muted">Line item sum <span className="font-figure tabular-nums text-cool">{fmt(lineItems.reduce((sum, li) => sum + (li.amount ?? 0), 0))}</span></p>
    </section>

    {record.rawText && <section className="border-t border-rule pt-4"><button type="button" aria-expanded={showSource} onClick={() => setShowSource(!showSource)} className="btn-secondary">{showSource ? "Hide source text" : "Show source text"}</button>{showSource && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-rule bg-paper-3 p-4 font-outlier text-xs text-ink-2">{record.rawText}</pre>}</section>}
    <footer className="flex flex-wrap items-center gap-3 border-t border-rule pt-4"><button type="button" onClick={handleSave} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save corrections"}</button>{saved && <p role="status" className="text-sm text-success">Saved. Record marked as reviewed.</p>}{error && <p role="alert" className="text-sm text-error">{error}</p>}</footer>
  </section>;
}
