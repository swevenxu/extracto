import { computeStats } from "@/lib/stats";
import { getActiveWorkspace, getPreferences, listRecordsByWorkspace } from "@/lib/storage";
import { currentUser } from "@/lib/session";
import { CurrencyBars, PipelineChart, WeeklyChart, documentsByWeek } from "@/components/AnalyticsCharts";
import Link from "next/link";

export const metadata = { title: "Analytics — Extracto" };
export default async function AnalyticsPage() {
  const user = await currentUser();
  const workspace = user ? getActiveWorkspace(user) : null;
  const records = workspace ? listRecordsByWorkspace(workspace.id) : [];
  const baseCurrency = user ? getPreferences(user.id)?.baseCurrency : undefined;
  const stats = user ? await computeStats(records, baseCurrency) : await computeStats(records);
  const weeks = documentsByWeek(records);
  const hasTotals = Object.keys(stats.totalsByCurrency).length > 0;

  return <main className="page-shell">
    <header className="page-heading"><div><h1>Analytics</h1><p>A summary of document processing and reviewed totals for this workspace.</p></div></header>
    <dl className="stat-strip mb-6">
      <div className="stat-item"><dt>Documents</dt><dd>{stats.totalRecords}</dd></div>
      <div className="stat-item"><dt>Reviewed</dt><dd>{stats.reviewed}</dd></div>
      <div className="stat-item"><dt>Needs review</dt><dd>{stats.extracted}</dd></div>
    </dl>

    <div className="analytics-grid">
      <section className="surface chart-card" aria-labelledby="weekly-heading">
        <div className="section-heading">
          <h2 id="weekly-heading">Documents by week</h2>
          <span className="text-sm text-muted">Last 8 weeks</span>
        </div>
        <WeeklyChart weeks={weeks} />
      </section>
      <section className="surface chart-card" aria-labelledby="pipeline-heading">
        <div className="section-heading">
          <h2 id="pipeline-heading">Processing pipeline</h2>
        </div>
        <PipelineChart stats={stats} />
      </section>
    </div>

    <section aria-labelledby="totals-heading" className="mt-6">
      <div className="section-heading"><h2 id="totals-heading">Reviewed totals by currency</h2></div>
      {hasTotals ? (
        <div className="surface chart-card"><CurrencyBars totals={stats.totalsByCurrency} /></div>
      ) : (
        <div className="surface grid justify-items-start gap-2 p-5">
          <p className="font-medium text-ink">No reviewed totals yet</p>
          <p className="text-sm text-muted">Totals appear here once documents in this workspace are reviewed and saved.</p>
          <Link href="/documents" className="btn-quiet">Open documents</Link>
        </div>
      )}
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
