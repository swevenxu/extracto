import { RecordsTable } from "@/components/RecordsTable";
import { listRecordsByUser } from "@/lib/storage";
import { currentUser } from "@/lib/session";
import { GoogleSheetsSettings } from "@/components/GoogleSheetsSettings";
import { DownloadCsvButton } from "@/components/DownloadCsvButton";

export const metadata = { title: "Documents — Extracto" };

export default async function DocumentsPage() {
  const user = await currentUser();
  const records = user ? listRecordsByUser(user.id) : [];
  return <main className="page-shell">
    <header className="page-heading"><div><h1>Documents</h1><p>Review extracted fields and export verified records.</p></div><DownloadCsvButton /></header>
    <section className="mb-8" aria-label="Google Sheets export"><GoogleSheetsSettings /></section>
    <section aria-label="Your documents"><div className="section-heading"><h2>Document ledger</h2><p className="text-sm text-muted">{records.length} {records.length === 1 ? "document" : "documents"}</p></div><RecordsTable initialRecords={records} /></section>
  </main>;
}
