import { getActiveWorkspace, getRecord, listActivity, workspaceMembers } from "@/lib/storage";
import { currentUser } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ReviewForm from "@/components/ReviewForm";
import { retryRecord } from "@/app/actions";

export const metadata = { title: "Review — Extracto" };
interface PageProps { params: Promise<{ id: string }>; }

export default async function RecordPage({ params }: PageProps) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  const workspace = getActiveWorkspace(user);
  const record = getRecord(id, workspace.id);
  if (!record) notFound();
  const members = workspaceMembers(workspace.id);
  const activity = listActivity(workspace.id, id, 50);
  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <h1>Review document</h1>
        <p>Check the fields for this document type before saving. Wrong type? Switch it in the header.</p>
      </div>
      <Link href="/documents" className="btn-secondary">Back to documents</Link>
    </header>
    <ReviewForm
      record={record}
      retryAction={retryRecord}
      members={members}
      activity={activity}
      currentUserId={user.id}
    />
  </main>;
}
