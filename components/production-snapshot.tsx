import type { ProjectPhase } from "@/lib/types";
import { summarizeProductionSnapshot } from "@/lib/production-snapshot";

export function ProductionSnapshot({
  title,
  phases,
  delivering,
  installing,
  className = "",
}: {
  title: string;
  phases: readonly ProjectPhase[];
  delivering: boolean;
  installing: boolean;
  className?: string;
}) {
  const rows = summarizeProductionSnapshot(phases, delivering, installing);

  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <div className="stage-summary">
        {rows.map(({ stage, count, total }) => (
          <div key={stage}>
            <span>{stage}</span>
            <progress aria-label={`${stage} progress`} max={total || 1} value={count} />
            <strong>
              {count}/{total}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}
