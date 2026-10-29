import { RecordsTable } from "@/components/RecordsTable";
import { StatCards } from "@/components/StatCards";
import { UsageMeter } from "@/components/UsageMeter";
import { getUsage } from "@/lib/usage";
import { computeStats } from "@/lib/stats";
import { getActiveWorkspace, getPreferences, listRecordsByWorkspace, workspaceMembers } from "@/lib/storage";
import { currentUser } from "@/lib/session";
import Link from "next/link";

export const metadata = {
  title: "Extracto — Document Data Extractor",
  description: "Upload invoices, receipts, and bank statements, extract structured data, and export to CSV.",
};

export default async function DashboardPage() {
  const user = await currentUser();
  const workspace = user ? getActiveWorkspace(user) : null;
  const records = workspace ? listRecordsByWorkspace(workspace.id) : [];
  const members = workspace ? workspaceMembers(workspace.id) : [];
  const baseCurrency = user ? getPreferences(user.id)?.baseCurrency : undefined;
  const stats = user ? await computeStats(records, baseCurrency) : await computeStats(records);
  const usage = user ? getUsage(user) : null;

  return (
    <div className="page-shell">
      <header className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Review extracted records before you export them.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/settings" className="btn-quiet">Manage workspace</Link>
          <Link href="/upload" className="btn-primary">Upload a document</Link>
        </div>
      </header>
      <div className="mb-6"><StatCards stats={stats} /></div>
      {usage && <div className="mb-8"><UsageMeter usage={usage} /></div>}
      <section aria-labelledby="recent-documents-title">
        <div className="section-heading">
          <h2 id="recent-documents-title">Recent documents</h2>
          <span className="text-sm text-muted">{records.length} {records.length === 1 ? "document" : "documents"}, {members.length} {members.length === 1 ? "member" : "members"}</span>
        </div>
        <RecordsTable initialRecords={records} members={members} currentUserId={user?.id ?? ""} />
      </section>
    </div>
  );
}
