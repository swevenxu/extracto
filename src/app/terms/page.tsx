import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Extracto",
  description: "Terms for using Extracto.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-ink">
      <Link href="/" className="text-sm text-accent underline">Back to Extracto</Link>
      <h1 className="mt-8 text-3xl font-medium">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated: November 1, 2026</p>

      <div className="mt-8 grid gap-6 leading-7">
        <section>
          <h2 className="text-xl font-medium">Using Extracto</h2>
          <p>You may use Extracto only for documents and accounts you are authorized to access. You are responsible for keeping your account credentials secure and for reviewing extracted results before relying on them.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Automated extraction</h2>
          <p>Extracto provides automated document extraction as an aid. Results may be incomplete or incorrect, and you must verify them before using them for financial, legal, tax, or business decisions.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Prohibited use</h2>
          <p>You may not use Extracto to upload unlawful content, violate another person&apos;s rights, circumvent access controls, or interfere with the service.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Availability</h2>
          <p>Extracto is provided as available. Features, limits, and supported document types may change as the service develops.</p>
        </section>
        <section>
          <h2 className="text-xl font-medium">Contact</h2>
          <p>Questions about these terms should be directed to the service owner through the channel where you received access to Extracto.</p>
        </section>
      </div>
    </main>
  );
}
