import Link from "next/link";
import { formatResetDate, type UsageSnapshot } from "@/lib/plans";

/**
 * The account's monthly allowance, shown before it runs out. Read on the
 * dashboard and in Settings; the numbers come from the same snapshot the upload
 * route enforces.
 */
export function UsageMeter({ usage }: { usage: UsageSnapshot }) {
  const { documents } = usage;
  // One figure in the head; the note only adds what it cannot say (when it resets,
  // and how much is left once that starts to matter).
  const note =
    usage.level === "full"
      ? `Allowance used. Processing resumes ${formatResetDate(usage.resetsAt)}.`
      : usage.level === "warning"
        ? `${documents.remaining} ${documents.remaining === 1 ? "document" : "documents"} left. Resets ${formatResetDate(usage.resetsAt)}.`
        : `Resets ${formatResetDate(usage.resetsAt)}.`;

  return (
    <section
      className="usage-panel"
      data-level={usage.level}
      aria-labelledby="usage-heading"
      id="usage"
    >
      <div className="usage-head">
        <div>
          <h2 id="usage-heading">Monthly processing</h2>
          <p className="text-sm text-muted">
            {usage.planName} plan, files up to {usage.maxFileMb} MB
          </p>
        </div>
        <p className="usage-figure">
          <strong>{documents.used}</strong> of {documents.limit} documents used
        </p>
      </div>
      <div
        className="usage-track"
        role="progressbar"
        aria-label="Documents processed this month"
        aria-valuemin={0}
        aria-valuemax={documents.limit}
        aria-valuenow={documents.used}
        aria-valuetext={`${documents.used} of ${documents.limit} documents used`}
      >
        <span className="usage-fill" data-level={usage.level} style={{ width: `${documents.percent}%` }} />
      </div>
      <p className="usage-note">
        {note}{" "}
        <Link href="/settings#billing">{usage.level === "ok" ? "Compare plans" : "See plans"}</Link>
      </p>
    </section>
  );
}
