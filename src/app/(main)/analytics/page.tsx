import { computeStats } from "@/lib/stats";
import { getPreferences, listRecordsByUser } from "@/lib/storage";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Analytics — Extracto" };

export default async function AnalyticsPage() {
  const user = await currentUser();
  const records = user ? listRecordsByUser(user.id) : [];
  const baseCurrency = user ? getPreferences(user.id)?.baseCurrency : undefined;
  const stats = user ? await computeStats(records, baseCurrency) : await computeStats(records);
  return <main className="page-shell">
    <header className="page-heading"><div><h1>Analytics</h1><p>A summary of document processing and reviewed totals.</p></div></header>
    <dl className="stat-strip mb-10">
      <div className="stat-item"><dt>Documents</dt><dd>{stats.totalRecords}</dd></div>
      <div className="stat-item"><dt>Reviewed</dt><dd>{stats.reviewed}</dd></div>
      <div className="stat-item"><dt>Needs review</dt><dd>{stats.extracted}</dd></div>
    </dl>
    <section aria-labelledby="totals-heading"><div className="section-heading"><h2 id="totals-heading">Reviewed totals by currency</h2></div>
      {Object.keys(stats.totalsByCurrency).length ? <div className="surface overflow-hidden"><table className="data-table"><thead><tr><th className="px-4">Currency</th><th className="px-4 text-right">Reviewed total</th></tr></thead><tbody>{Object.entries(stats.totalsByCurrency).map(([currency, total]) => <tr key={currency}><td className="px-4 font-outlier text-cool">{currency}</td><td className="px-4 text-right font-figure tabular-nums text-cool">{new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(total)}</td></tr>)}</tbody></table></div> : <p className="surface p-5 text-sm text-muted">Reviewed totals will appear here after you save a document.</p>}
    </section>
    {stats.grandTotal && (
      <section aria-labelledby="grand-total-heading" className="mt-6">
        <div className="surface p-5">
          <h2 id="grand-total-heading" className="text-sm text-muted">Grand total (converted to base currency)</h2>
          <p className="mt-2 text-2xl font-medium text-ink font-figure tabular-nums">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: stats.grandTotal.currency,
              maximumFractionDigits: 2,
            }).format(stats.grandTotal.amount)}
          </p>
        </div>
      </section>
    )}
  </main>;
}
