import { getRecord } from "@/lib/storage";
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
  const record = getRecord(id, user.id);
  if (!record) notFound();
  return <main className="page-shell">
    <header className="page-heading"><div><h1>Review document</h1><p>Check extracted fields and line items before saving.</p></div><Link href="/documents" className="btn-secondary">Back to documents</Link></header>
    <ReviewForm record={record} retryAction={retryRecord} />
  </main>;
}
