import assert from "node:assert/strict";
import test from "node:test";
import { makeSplit, normalizeProject, persistActivePhase, selectPhase } from "../lib/phases";
import { newProject } from "../lib/types";

test("project fulfillment options default off for new projects", () => {
  const project = newProject();
  assert.equal(project.data.delivering, false);
  assert.equal(project.data.installing, false);
});

test("project fulfillment options survive normalization, phase changes, saves, and splits", () => {
  const project = newProject();
  const phase = project.data.phases![0];
  project.data.delivering = true;
  project.data.installing = true;
  project.data.openings = [
    { id: "A", name: "A" },
    { id: "B", name: "B" },
  ];
  phase.data.openings = structuredClone(project.data.openings);

  const selected = selectPhase(project, phase.id);
  assert.equal(selected.data.delivering, true);
  assert.equal(selected.data.installing, true);

  const saved = persistActivePhase(selected.data);
  assert.equal(saved.delivering, true);
  assert.equal(saved.installing, true);

  const normalized = normalizeProject({ ...project, data: saved });
  assert.equal(normalized.data.delivering, true);
  assert.equal(normalized.data.installing, true);

  const split = makeSplit(normalized, "North", "South", ["B"]);
  assert.equal(split.data.delivering, true);
  assert.equal(split.data.installing, true);
});
