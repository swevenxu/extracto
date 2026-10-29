import { UploadZone } from "@/components/UploadZone";
import { currentUser } from "@/lib/session";
import { getUsage } from "@/lib/usage";
import Link from "next/link";

export const metadata = { title: "Upload — Extracto" };
export default async function UploadPage() {
  const user = await currentUser();
  const usage = user ? getUsage(user) : null;

  return <main className="page-shell">
    <div className="page-column">
      <header className="page-heading"><div><h1>Upload documents</h1><p>Extract invoice, receipt, or bank statement fields in batches, then check each one before export.</p></div></header>
      <UploadZone usage={usage} />
      <p className="mt-4 max-w-prose text-sm text-muted">PDF, TXT, or image (JPG, PNG, WebP), up to {usage?.maxFileMb ?? 8} MB each. Each type gets its own fields, so pick one above or let Extracto detect it. Every file in a batch shows its own progress and can be retried on its own. Find results in <Link href="/documents" className="text-accent underline">Documents</Link>.</p>
    </div>
  </main>;
}
