import { UploadZone } from "@/components/UploadZone";
import Link from "next/link";

export const metadata = { title: "Upload — Extracto" };

export default function UploadPage() {
  return <main className="page-shell max-w-5xl">
    <header className="page-heading"><div><h1>Upload documents</h1><p>Extract key fields from an invoice or receipt, then check them before export.</p></div></header>
    <UploadZone />
    <p className="mt-4 text-sm text-muted">Text-based PDF or TXT, up to 8 MB. Files are processed on this server. Find results in <Link href="/documents" className="text-accent underline">Documents</Link>.</p>
  </main>;
}
