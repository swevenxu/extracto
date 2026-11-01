import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Extracto",
  description: "How Extracto handles account, document, and Google Sheets data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <Link href="/" className="text-sm text-accent underline">Back to Extracto</Link>
      <h1 className="mt-8 text-3xl font-medium">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: November 1, 2026</p>

      <div className="mt-8 grid gap-6 leading-7">
        <section>
          <h2 className="text-xl font-medium">Information we store</h2>
          <p>Extracto stores the account name and email address you provide, encrypted password credentials, workspace settings, extracted document data, and usage information needed to provide the service.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Uploaded documents</h2>
          <p>Documents uploaded to Extracto are stored privately so the service can extract, review, and display their contents. Do not upload documents you are not authorized to process. You can delete records and their associated files from the application.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Google Sheets</h2>
          <p>If you connect Google Sheets, Extracto requests spreadsheet access so you can export reviewed records to a spreadsheet you choose. Google tokens are encrypted before storage. You can disconnect Google from the application at any time.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Service providers</h2>
          <p>Extracto uses hosted infrastructure and document extraction providers to operate the service. Document content may be sent to the configured extraction provider to produce structured results.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Contact</h2>
          <p>For privacy questions or account deletion requests, contact the service owner through the channel where you received access to Extracto.</p>
        </section>
      </div>
    </main>
  );
}
