import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAnalysisToPhaseRows, mergePhaseCandidateRows } from "../lib/drawing-takeoff/phase-import";
import type { Row } from "../lib/types";

test("maps extracted schedule and hardware fields into phase tab rows as AI drafts", () => {
  const rows = mapAnalysisToPhaseRows("doc-1", {
    openings: [{ mark: "101A", width: "3'-0\"", handing: "RH", quantity: "2", sourcePage: 8, evidence: "Door schedule" }],
    walls: [{ code: "W1", finishedThickness: "6\"", layers: ["GWB", "stud"], sourcePage: 7, evidence: "Wall schedule" }],
    doorTypes: [{ code: "D1", material: "HM", manufacturer: "Acme", sourcePage: 8, evidence: "Door type" }],
    hardwareGroups: [{ group: "01", component: "Hinge", quantity: 3, sourcePage: 9, evidence: "Hardware set" }],
  });

  assert.equal(rows.openings?.[0].name, "101A");
  assert.equal(rows.openings?.[0].qty, "2");
  assert.equal(rows.openings?.[0].handing, "RH");
  assert.equal(rows.walls?.[0].size, "6\"");
  assert.equal(rows.walls?.[0].layers, "GWB / stud");
  assert.equal(rows.doorTypes?.[0].brand, "Acme");
  assert.equal(rows.hardware?.[0].component, "Hinge");
  assert.equal(rows.hardware?.[0].qty, 3);
  for (const list of Object.values(rows)) {
    assert.equal(list?.[0].reviewState, "ai-draft");
    assert.equal(list?.[0].sourceDocumentId, "doc-1");
    assert.ok(list?.[0].sourceCandidateKey);
  }
});

test("re-analysis refreshes an AI draft once and leaves reviewed values untouched", () => {
  const original = mapAnalysisToPhaseRows("doc-1", {
    openings: [{ mark: "101A", width: "3'-0\"", quantity: "1", sourcePage: 8, evidence: "Old read", confidence: 0.6 }],
  }).openings![0];
  const revised = mapAnalysisToPhaseRows("doc-1", {
    openings: [{ mark: "101A", width: "3'-6\"", quantity: "2", sourcePage: 8, evidence: "New read", confidence: 0.9 }],
  }).openings![0];
  const updated = mergePhaseCandidateRows([original], [revised]);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, original.id);
  assert.equal(updated[0].width, "3'-6\"");
  assert.equal(updated[0].qty, "2");

  const reviewed = { ...updated[0], reviewState: "human-reviewed", width: "3'-4\"" } as Row;
  const preserved = mergePhaseCandidateRows([reviewed], [revised]);
  assert.equal(preserved.length, 1);
  assert.equal(preserved[0].width, "3'-4\"");
});

test("keeps the same mark from separate source sheets as separate candidates", () => {
  const rows = mapAnalysisToPhaseRows("doc-1", {
    openings: [
      { mark: "101A", quantity: "1", sourcePage: 8, evidence: "Plan north wing" },
      { mark: "101A", quantity: "1", sourcePage: 9, evidence: "Plan south wing" },
    ],
  }).openings!;
  assert.notEqual(rows[0].sourceCandidateKey, rows[1].sourceCandidateKey);
  assert.equal(mergePhaseCandidateRows([], rows).length, 2);
});
