import type { Stats } from "@/lib/types";

export function StatCards({ stats }: { stats: Stats }) {
  const values = [
    { label: "Documents", value: stats.totalRecords },
    { label: "Reviewed", value: stats.reviewed },
    { label: "Needs review", value: stats.extracted },
  ];

  return (
    <dl className="stat-strip" aria-label="Document counts">
      {values.map((item) => (
        <div className="stat-item" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
