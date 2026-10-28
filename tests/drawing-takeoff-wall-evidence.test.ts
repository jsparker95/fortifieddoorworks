import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inventoryWallNotes, reconcileWallNotes } from "../lib/drawing-takeoff/wall-evidence";
import { mapAnalysisToPhaseRows, mergePhaseCandidateRows } from "../lib/drawing-takeoff/phase-import";

for (const page of [12, 26]) test(`partition page ${page} keeps notes with their own diagram`, () => {
  const source = JSON.parse(fs.readFileSync(`tests/fixtures/schedules/rockingham-walls-${page}.json`, "utf8"));
  const rows = inventoryWallNotes(source);
  assert.deepEqual(rows.map(row => row.code), Array.from({ length: 11 }, (_, index) => `W${index + 1}`));
  assert.equal(rows.find(row => row.code === "W7")?.description, "N/A");
  const exterior = rows.find(row => row.code === "W8")!;
  assert.equal(exterior.layers.length, 6);
  assert.match(exterior.description, /8" GIRT/);
  assert.match(exterior.description, /4" MANUFACTURED STONE/);
  assert.doesNotMatch(exterior.description, /CMU/);
  assert.match(rows.find(row => row.code === "W9")!.description, /THERMAWALL SHADOWLINE/);
  assert.match(rows.find(row => row.code === "W10")!.description, /SHADOWALL/);
  assert.ok(rows.every(row => row.finishedThickness === ""));
  assert.match(rows.find(row => row.code === "W2")!.description, page === 12 ? /30 MIN/ : /1-HR/);
  assert.ok(rows.every(row => row.sourcePage === page));
});

test("corrected wall drafts retain IDs and reviewed values; unknown layouts retain visual output", () => {
  const source = JSON.parse(fs.readFileSync("tests/fixtures/schedules/rockingham-walls-12.json", "utf8"));
  const prior = { code: "W7", description: "Misassigned exterior wall", finishedThickness: '8"', layers: [], sourcePage: 12, evidence: "W7", confidence: 0.8 };
  const extra = { ...prior, code: "FIRE WALL" };
  const fixed = reconcileWallNotes(source, [prior, extra]);
  assert.ok(fixed.some(row => row.code === "FIRE WALL"));
  const old = mapAnalysisToPhaseRows("doc", { walls: [prior] }).walls![0];
  const incoming = mapAnalysisToPhaseRows("doc", { walls: fixed.filter(row => row.code === "W7") }).walls!;
  const merged = mergePhaseCandidateRows([old], incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, old.id);
  assert.equal(merged[0].description, "N/A");
  const reviewed = { ...old, reviewState: "human-reviewed" };
  assert.deepEqual(mergePhaseCandidateRows([reviewed], incoming), [reviewed]);
  assert.deepEqual(reconcileWallNotes({ ...source, boxes: [] }, [prior]), [prior]);
});
