import { test } from "node:test";
import assert from "node:assert/strict";
import { duplicateProject } from "../lib/duplicate-project";
import { newProject } from "../lib/types";

test("project duplication keeps every phase and its linked schedule data with fresh ids", () => {
  const source = newProject();
  source.name = "School doors";
  source.status = "In production";
  source.building = "North building";
  const first = source.data.phases![0];
  first.name = "Frames";
  first.data.openings = [{ id: "opening-1", name: "101", width: "3/0" }];
  first.data.milestones = { "opening-1": { "Frames produced": "2026-10-01" } };
  first.data.takeoffSelection = { frame: true };
  first.data.elevations = [{
    openingId: "opening-1", kind: "Door + sidelight", widthIn: 42, heightIn: 84,
    doorWidthIn: 36, doorHeightIn: 84, chairRailIn: 0, verticalMullions: 0,
    horizontalRails: 0, weldCount: 0, glassStopFeet: 0, notes: "North entrance",
  }];
  const second = structuredClone(first);
  second.id = "phase-2";
  second.name = "Doors";
  second.data.openings = [{ id: "opening-2", name: "202", width: "3/6" }];
  second.data.elevations = [];
  second.data.milestones = { "opening-2": { "Doors produced": "2026-10-02" } };
  source.data.phases = [first, second];
  source.data.activePhaseId = second.id;
  Object.assign(source.data, structuredClone(second.data));
  source.data.phases = [first, second];
  source.data.activePhaseId = second.id;
  source.data.phaseHistory = [];

  const { project: copy, phaseIds } = duplicateProject(source);
  const copiedFirst = copy.data.phases!.find((phase) => phase.name === "Frames")!;
  const copiedSecond = copy.data.phases!.find((phase) => phase.name === "Doors")!;

  assert.equal(copy.data.phases!.length, 2);
  assert.equal(phaseIds.size, 2);
  assert.notEqual(copy.id, source.id);
  assert.notEqual(copiedFirst.id, first.id);
  assert.notEqual(copiedSecond.id, second.id);
  assert.notEqual(copiedFirst.data.openings[0].id, "opening-1");
  assert.notEqual(copiedSecond.data.openings[0].id, "opening-2");
  assert.equal(copiedFirst.data.elevations![0].openingId, copiedFirst.data.openings[0].id);
  assert.deepEqual(copiedFirst.data.milestones, {});
  assert.deepEqual(copiedSecond.data.milestones, {});
  assert.deepEqual(copiedFirst.data.takeoffSelection, {});
  assert.equal(copy.data.activePhaseId, copiedSecond.id);
  assert.equal(copy.data.openings[0].name, "202");
  assert.equal(copy.building, source.building);
  assert.equal(copy.status, "Planning");
  assert.equal(copy.source_id, null);
});
