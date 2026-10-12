import { normalizeMark, observeSwing, type DoorDetection } from "./geometry";

export type ScheduleOpening = {
  mark: string; sourcePage: number; evidence: string; confidence: number;
  width: string; height: string; handing: string; doorType: string;
  frameType: string; wallType: string; hardwareGroup: string; fireRating: string;
  room: string; quantity: string;
};
export type MatchedOpening = {
  detection: DoorDetection; schedule: ScheduleOpening | null;
  scheduleMatches: ScheduleOpening[];
  swing: ReturnType<typeof observeSwing>;
  reviewReasons: string[];
  /** Handing is copied only from explicit schedule text, pending the reference-side convention. */
  handing: string;
};

/** Exact normalized-ID join. No nearest-number guessing or silently selecting a duplicate schedule row. */
export function matchSchedule(doors: DoorDetection[], schedule: ScheduleOpening[]): {
  openings: MatchedOpening[]; unmatchedSchedule: ScheduleOpening[];
} {
  const index = new Map<string, ScheduleOpening[]>();
  for (const row of schedule) {
    const mark = normalizeMark(row.mark);
    if (mark) index.set(mark, [...(index.get(mark) || []), row]);
  }
  const planCounts = new Map<string, number>();
  for (const door of doors) {
    const mark = normalizeMark(door.mark || "");
    if (mark) planCounts.set(mark, (planCounts.get(mark) || 0) + 1);
  }
  const matched = new Set<ScheduleOpening>();
  const openings = doors.map((detection): MatchedOpening => {
    const mark = normalizeMark(detection.mark || "");
    const candidates = mark ? index.get(mark) || [] : [];
    const row = candidates.length === 1 ? candidates[0] : null;
    if (row) matched.add(row);
    const reviewReasons: string[] = [];
    if (!mark) reviewReasons.push("Door tag is missing or unreadable.");
    else if (!candidates.length) reviewReasons.push(`No schedule row matches door ${mark}.`);
    else if (candidates.length > 1) reviewReasons.push(`Multiple schedule rows match ${mark}; choose the correct sheet/revision.`);
    if ((planCounts.get(mark) || 0) > 1) reviewReasons.push("This door mark occurs more than once in the selected drawings; review plan/detail duplicates.");
    if (detection.confidence < 0.8 || (row && row.confidence < 0.8)) reviewReasons.push("Low extraction confidence; inspect the cited source.");
    if (!row?.handing) reviewReasons.push("Handing requires the reference-side convention and visual review.");
    if (row && (!row.width || !row.height)) reviewReasons.push("Schedule dimensions are incomplete.");
    return { detection, schedule: row, scheduleMatches: candidates, swing: observeSwing(detection), reviewReasons, handing: row?.handing || "" };
  });
  return { openings, unmatchedSchedule: schedule.filter((row) => !matched.has(row)) };
}
