import { RecordsTable } from "@/components/RecordsTable";
import { getActiveWorkspace, listRecordsByWorkspace, workspaceMembers } from "@/lib/storage";
import { currentUser } from "@/lib/session";
import { GoogleSheetsSettings } from "@/components/GoogleSheetsSettings";
import { DownloadCsvButton } from "@/components/DownloadCsvButton";
import Link from "next/link";

export const metadata = { title: "Documents — Extracto" };

export default async function DocumentsPage() {
  const user = await currentUser();
  const workspace = user ? getActiveWorkspace(user) : null;
  const records = workspace ? listRecordsByWorkspace(workspace.id) : [];
  const members = workspace ? workspaceMembers(workspace.id) : [];
  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <h1>Documents</h1>
        <p>Review extracted fields and export verified records.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/settings" className="btn-quiet">Manage workspace</Link>
        <DownloadCsvButton />
      </div>
    </header>
    <section className="mb-8" aria-label="Google Sheets export"><GoogleSheetsSettings /></section>
    <section aria-label="Your documents">
      <div className="section-heading">
        <h2>Document ledger</h2>
        <p className="text-sm text-muted">{records.length} {records.length === 1 ? "document" : "documents"}, {members.length} {members.length === 1 ? "member" : "members"}</p>
      </div>
      <RecordsTable initialRecords={records} members={members} currentUserId={user?.id ?? ""} />
    </section>
  </main>;
}
