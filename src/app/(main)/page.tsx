import { RecordsTable } from "@/components/RecordsTable";
import { StatCards } from "@/components/StatCards";
import { computeStats } from "@/lib/stats";
import { getPreferences, listRecordsByUser } from "@/lib/storage";
import { currentUser } from "@/lib/session";
import Link from "next/link";

export const metadata = {
  title: "Extracto — Invoice & Receipt Extractor",
  description: "Upload invoices and receipts, extract structured data, and export to CSV.",
};

export default async function DashboardPage() {
  const user = await currentUser();
  const records = user ? listRecordsByUser(user.id) : [];
  const baseCurrency = user ? getPreferences(user.id)?.baseCurrency : undefined;
  const stats = user ? await computeStats(records, baseCurrency) : await computeStats(records);

  return (
    <div className="page-shell">
      <header className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Review extracted records before you export them.</p>
        </div>
        <Link href="/upload" className="btn-primary">Upload a document</Link>
      </header>
      <div className="mb-8"><StatCards stats={stats} /></div>
      <section aria-labelledby="recent-documents-title">
        <div className="section-heading">
          <h2 id="recent-documents-title">Recent documents</h2>
          <span className="text-sm text-muted">{records.length} documents</span>
        </div>
        <RecordsTable initialRecords={records} />
      </section>
    </div>
  );
}
