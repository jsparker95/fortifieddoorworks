import type { ProductionWorkSession } from "./types";

const productionKinds = new Set(["frame", "door", "hardware"]);
const dayKey = (value: string) => new Date(value).toLocaleDateString("en-CA");
const sessionHours = (row: ProductionWorkSession, now: number) =>
  Math.max(
    0,
    (new Date(row.ended_at || now).getTime() - new Date(row.started_at).getTime()) /
      3_600_000,
  );

export type DailyEfficiencyRow = {
  employee: string;
  shift: number;
  coded: number;
  credit: number;
  unreviewed: number;
  completedItems: ProductionWorkSession[];
  productive: number;
  efficiency: number | null;
};

/** Summarize today's hours and list products completed today for each employee. */
export function summarizeDailyEfficiency(
  rows: readonly ProductionWorkSession[],
  today: string,
  now: number,
): DailyEfficiencyRow[] {
  const grouped = new Map<
    string,
    Omit<DailyEfficiencyRow, "productive" | "efficiency">
  >();

  for (const row of rows) {
    const startedToday = dayKey(row.started_at) === today;
    const completedToday =
      productionKinds.has(row.work_kind) &&
      row.status === "completed" &&
      !!row.ended_at &&
      dayKey(row.ended_at) === today;
    if (!startedToday && !completedToday) continue;

    const stats = grouped.get(row.worker_email) || {
      employee: row.worker_email,
      shift: 0,
      coded: 0,
      credit: 0,
      unreviewed: 0,
      completedItems: [],
    };

    if (startedToday) {
      if (row.work_kind === "shift") stats.shift += sessionHours(row, now);
      if (row.work_kind === "coded") {
        if (row.status === "approved") stats.coded += sessionHours(row, now);
        if (row.status === "pending_approval")
          stats.unreviewed += sessionHours(row, now);
      }
      if (row.work_kind === "frame" && row.status === "completed")
        stats.credit += Number(row.piece_rate_hours || 0);
    }

    if (completedToday) stats.completedItems.push(row);
    grouped.set(row.worker_email, stats);
  }

  return [...grouped.values()].map((stats) => ({
    ...stats,
    completedItems: stats.completedItems.sort(
      (a, b) => Date.parse(b.ended_at || "") - Date.parse(a.ended_at || ""),
    ),
    productive: Math.max(0, stats.shift - stats.coded),
    efficiency:
      stats.shift > stats.coded
        ? Math.round((stats.credit / (stats.shift - stats.coded)) * 100)
        : null,
  }));
}
