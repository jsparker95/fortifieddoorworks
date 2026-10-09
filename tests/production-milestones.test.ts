import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectData, ProjectPhase } from "../lib/types";
import { recordProductionMilestone } from "../lib/production-milestones";

const makePhase = (id: string, openingId: string): ProjectPhase => ({
  id,
  name: `Phase ${id}`,
  createdAt: "2026-10-09",
  data: {
    walls: [], doorTypes: [], hardware: [],
    openings: [{ id: openingId, name: openingId }],
    milestones: {}, references: [], links: [],
  },
});

test("production work records a milestone on its phase without touching sibling phases", () => {
  const first = makePhase("phase-a", "opening-a");
  const second = makePhase("phase-b", "opening-b");
  const project: ProjectData = {
    ...first.data,
    phases: [first, second],
    activePhaseId: first.id,
    phaseHistory: [],
  };

  const updated = recordProductionMilestone(project, first.id, "opening-a", "frame", "2026-10-09");

  assert.equal(updated?.milestones["opening-a"]["Frames produced"], "2026-10-09");
  assert.equal(updated?.phases?.[0].data.milestones["opening-a"]["Frames produced"], "2026-10-09");
  assert.deepEqual(updated?.phases?.[1], second);
  assert.deepEqual(project.phases?.[0].data.milestones, {});
});

test("a removed phase or opening cannot receive a production milestone", () => {
  const phase = makePhase("phase-a", "opening-a");
  const project: ProjectData = { ...phase.data, phases: [phase], activePhaseId: phase.id, phaseHistory: [] };

  assert.equal(recordProductionMilestone(project, "removed-phase", "opening-a", "door", "2026-10-09"), null);
  assert.equal(recordProductionMilestone(project, phase.id, "removed-opening", "hardware", "2026-10-09"), null);
});
