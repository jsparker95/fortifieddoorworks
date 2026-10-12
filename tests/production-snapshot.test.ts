import assert from "node:assert/strict";
import test from "node:test";
import { summarizeProductionSnapshot } from "../lib/production-snapshot";
import { emptyPhaseContent, type ProjectPhase } from "../lib/types";

function phase(
  id: string,
  openingIds: string[],
  milestones: Record<string, Record<string, string>> = {},
): ProjectPhase {
  const data = emptyPhaseContent();
  data.openings = openingIds.map((openingId) => ({
    id: openingId,
    name: openingId,
    wall: "NA",
    doorType: "NA",
    group: "A",
    width: "3/0",
    height: "7/0",
  }));
  data.milestones = milestones;
  return { id, name: id, createdAt: "2026-01-01T00:00:00.000Z", data };
}

test("snapshot hides delivery and installation stages unless selected", () => {
  const rows = summarizeProductionSnapshot(
    [phase("one", ["A"])],
    false,
    false,
  );
  const shownStages = rows.map((row) => row.stage);
  assert.ok(!shownStages.some((stage) => stage.endsWith("delivered")));
  assert.ok(!shownStages.some((stage) => stage.endsWith("installed")));
  assert.ok(shownStages.includes("Frames produced"));
  assert.ok(shownStages.includes("Hardware received"));
});

test("project snapshot aggregates milestone counts across all phases", () => {
  const phases = [
    phase("one", ["A", "B"], {
      A: { "Frames delivered": "2026-01-02" },
      B: { "Doors installed": "2026-01-03" },
    }),
    phase("two", ["C"], {
      C: { "Frames delivered": "2026-01-04" },
    }),
  ];
  const rows = summarizeProductionSnapshot(phases, true, false);
  const deliveredFrames = rows.find((row) => row.stage === "Frames delivered");
  assert.deepEqual(deliveredFrames, {
    stage: "Frames delivered",
    count: 2,
    total: 3,
  });
  assert.ok(!rows.some((row) => row.stage.endsWith("installed")));
});

test("installation snapshot includes installation stages when selected", () => {
  const rows = summarizeProductionSnapshot(
    [phase("one", ["A"], { A: { "Doors installed": "2026-01-02" } })],
    false,
    true,
  );
  assert.deepEqual(rows.find((row) => row.stage === "Doors installed"), {
    stage: "Doors installed",
    count: 1,
    total: 1,
  });
  assert.ok(!rows.some((row) => row.stage.endsWith("delivered")));
});
