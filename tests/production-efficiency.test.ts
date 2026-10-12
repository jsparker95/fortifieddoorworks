import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDailyEfficiency } from "../lib/production-efficiency";
import type { ProductionWorkSession } from "../lib/types";

const today = "2026-10-12";
const at = (time: string) => new Date(`${today}T${time}:00`).toISOString();

function session(
  overrides: Partial<ProductionWorkSession>,
): ProductionWorkSession {
  return {
    id: "session",
    worker_email: "employee@example.com",
    project_id: "project-1",
    phase_id: "phase-1",
    opening_id: "opening-1",
    opening_mark: "A-101",
    work_kind: "frame",
    coded_category: "",
    status: "completed",
    started_at: at("09:00"),
    ended_at: at("09:30"),
    piece_rate_hours: 1.5,
    notes: "",
    approved_by: null,
    approved_at: null,
    created_at: at("09:00"),
    ...overrides,
  };
}

test("today's efficiency lists each frame, door, and hardware item completed today", () => {
  const rows = summarizeDailyEfficiency(
    [
      session({
        id: "frame-1",
        work_kind: "frame",
        opening_mark: "A-101",
        ended_at: at("09:30"),
      }),
      session({
        id: "door-1",
        work_kind: "door",
        opening_mark: "A-102",
        ended_at: at("10:30"),
      }),
      session({
        id: "hardware-1",
        work_kind: "hardware",
        opening_mark: "B-201",
        ended_at: at("11:30"),
      }),
      session({ id: "running", status: "running", ended_at: null }),
      session({
        id: "yesterday",
        started_at: new Date("2026-10-11T09:00:00").toISOString(),
        ended_at: new Date("2026-10-11T09:30:00").toISOString(),
      }),
    ],
    today,
    new Date(`${today}T17:00:00`).getTime(),
  );

  assert.equal(rows.length, 1);
  assert.deepEqual(
    rows[0].completedItems.map((item) => `${item.work_kind}:${item.opening_mark}`),
    ["hardware:B-201", "door:A-102", "frame:A-101"],
  );
  assert.equal(rows[0].credit, 1.5);
});

test("an item started yesterday appears when it is completed today", () => {
  const completed = session({
    id: "overnight-frame",
    started_at: new Date("2026-10-11T23:30:00").toISOString(),
    ended_at: new Date(`${today}T00:30:00`).toISOString(),
  });
  const rows = summarizeDailyEfficiency([completed], today, Date.now());

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].completedItems, [completed]);
  assert.equal(rows[0].credit, 0);
});
