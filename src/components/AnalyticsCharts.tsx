import type { ExtractedRecord, Stats } from "@/lib/types";

/**
 * Analytics figures, built from the workspace's own records.
 *
 * Bars are HTML, not a chart library: the figures stay in the app's type at every
 * width, every value starts at zero, and nothing is drawn for a record that does
 * not exist. One accent carries the measuring series; the rest are state colours.
 */

export interface WeekPoint {
  key: string;
  label: string;
  count: number;
}

const WEEK_COUNT = 8;

function startOfWeek(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (start.getUTCDay() + 6) % 7; // Monday
  start.setUTCDate(start.getUTCDate() - offset);
  return start;
}

/** Documents per week for the last eight weeks, oldest first. */
export function documentsByWeek(records: ExtractedRecord[], now = new Date()): WeekPoint[] {
  const thisWeek = startOfWeek(now);
  const points: WeekPoint[] = [];
  for (let index = WEEK_COUNT - 1; index >= 0; index--) {
    const start = new Date(thisWeek);
    start.setUTCDate(start.getUTCDate() - index * 7);
    points.push({
      key: start.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start),
      count: 0,
    });
  }
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const record of records) {
    const uploaded = new Date(record.uploadedAt);
    if (Number.isNaN(uploaded.getTime())) continue;
    const bucket = byKey.get(startOfWeek(uploaded).toISOString().slice(0, 10));
    if (bucket) bucket.count += 1;
  }
  return points;
}

export function WeeklyChart({ weeks }: { weeks: WeekPoint[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.count));
  const total = weeks.reduce((sum, week) => sum + week.count, 0);

  if (total === 0) {
    return (
      <figure className="chart">
        <p className="chart-note">No documents uploaded in the last eight weeks.</p>
      </figure>
    );
  }

  return (
    <figure className="chart">
      <div className="chart-plot" role="img" aria-label={`Documents per week for the last ${weeks.length} weeks. ${total} in total.`}>
        <div className="chart-grid" aria-hidden="true"><span /><span /><span /></div>
        <div className="chart-bars">
          {weeks.map((week) => (
            <div className="chart-slot" key={week.key}>
              <span className="chart-value">{week.count > 0 ? week.count : ""}</span>
              <div className="chart-track">
                <span
                  className="chart-bar"
                  style={{ height: `${(week.count / max) * 100}%`, opacity: week.count === 0 ? 0 : 1 }}
                />
              </div>
              <span className="chart-label">{week.label}</span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="chart-note">
        {total} {total === 1 ? "document" : "documents"} uploaded over eight weeks.
      </figcaption>
    </figure>
  );
}

interface Segment {
  key: string;
  label: string;
  value: number;
  tone: "accent" | "accent-soft" | "neutral" | "bad";
}

export function PipelineChart({ stats }: { stats: Stats }) {
  const total = stats.totalRecords;
  const segments: Segment[] = [
    { key: "reviewed", label: "Reviewed", value: stats.reviewed, tone: "accent" },
    { key: "extracted", label: "Needs review", value: stats.extracted, tone: "accent-soft" },
    { key: "processing", label: "Processing", value: stats.processing, tone: "neutral" },
    { key: "failed", label: "Failed", value: stats.failed, tone: "bad" },
  ].filter((segment) => segment.value > 0) as Segment[];

  const reviewedShare = total === 0 ? 0 : Math.round((stats.reviewed / total) * 100);

  if (total === 0) {
    return (
      <figure className="chart">
        <p className="chart-note">No documents in this workspace yet.</p>
      </figure>
    );
  }

  return (
    <figure className="chart">
      <p className="pipeline-figure">
        <strong>{reviewedShare}%</strong> reviewed
      </p>
      <div
        className="pipeline"
        role="img"
        aria-label={segments.map((segment) => `${segment.value} ${segment.label.toLowerCase()}`).join(", ")}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="pipeline-segment"
            data-tone={segment.tone}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="chart-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className="legend-swatch" data-tone={segment.tone} aria-hidden="true" />
            <span className="legend-label">{segment.label}</span>
            <span className="legend-value">{segment.value}</span>
          </li>
        ))}
      </ul>
      <figcaption className="chart-note">
        {total === 1 ? "1 document" : `${total} documents`} in this workspace, by review state.
      </figcaption>
    </figure>
  );
}

export function CurrencyBars({ totals }: { totals: Record<string, number> }) {
  const rows = Object.entries(totals)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;

  const format = (currency: string, amount: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  return (
    <ul className="currency-bars">
      {rows.map(([currency, amount]) => (
        <li key={currency} className="currency-row">
          <span className="currency-code">{currency}</span>
          <span className="currency-track" aria-hidden="true">
            <span className="currency-fill" style={{ width: `${(amount / max) * 100}%` }} />
          </span>
          <span className="currency-value">{format(currency, amount)}</span>
        </li>
      ))}
    </ul>
  );
}
