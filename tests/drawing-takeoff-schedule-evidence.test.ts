import assert from "node:assert/strict";
import test from "node:test";
import { printedDoorScheduleRows, printedHardwareScheduleRows, reconcileOpeningsWithPrintedSchedule } from "../lib/drawing-takeoff/schedule-evidence";
import { extractionSchema } from "../lib/drawing-takeoff/extraction-schema";
import { mapAnalysisToPhaseRows } from "../lib/drawing-takeoff/phase-import";

const page = { page: 9, text: `DOOR HARDWARE SCHEDULE
SET NO. 1 (DR. 1) 1 CYLINDER: 20-062 X US26D................ SCHLAGE 1 PAIR OFFSET PIVOTS: 195/188 X US26D............ RIXON
SET NO. 5 (DR. 5, 6) 3 HINGES: BB1279 X US26D................ HAGER 1 PRIVACY LOCK: AU5302LN X US26D........ YALE
DOOR TYPES DOOR SCHEDULE MK DOOR DOOR HARDWARE FRAME DETAILS FIRE RATING
1 3'-0" X 7'-0" A REFER TO FLOOR PLAN
5 3'-0" X 7'-0" C REFER TO FLOOR PLAN
6 3'-0" X 7'-0" C REFER TO FLOOR PLAN
HEAD WIDTH GENERAL NOTES` };

test("printed schedule fixes shared hardware sets and excludes invented AI door marks", () => {
  const model = extractionSchema.shape.openings.parse([
    { mark: "5", room: "", width: "", height: "", handing: "", doorType: "C", frameType: "", wallType: "", hardwareGroup: "6", fireRating: "", quantity: "1", sourcePage: 9, evidence: "AI", confidence: 0.8 },
    { mark: "8", room: "", width: "", height: "", handing: "", doorType: "C", frameType: "", wallType: "", hardwareGroup: "5", fireRating: "", quantity: "1", sourcePage: 9, evidence: "AI", confidence: 0.8 },
  ]);
  const result = reconcileOpeningsWithPrintedSchedule(model, [page]);
  assert.deepEqual(printedDoorScheduleRows([page]).map((row) => [row.mark, row.hardwareGroup]), [["1", "1"], ["5", "5"], ["6", "5"]]);
  assert.deepEqual(result.openings.slice(0, 3).map((row) => [row.mark, row.hardwareGroup, row.width, row.quantity]), [
    ["1", "1", "3'-0\"", "1"], ["5", "5", "3'-0\"", "1"], ["6", "5", "3'-0\"", "1"],
  ]);
  assert.equal(result.openings[3].autoImportEligible, false);
  assert.deepEqual(mapAnalysisToPhaseRows("doc", { openings: result.openings }).openings?.map((row) => row.name), ["1", "5", "6"]);
});

test("hardware rows are copied from printed component names, quantities, and brands", () => {
  const rows = printedHardwareScheduleRows([page]);
  assert.deepEqual(rows.map((row) => [row.group, row.quantity, row.brand]), [
    ["1", 1, "SCHLAGE"], ["1", 1, "RIXON"], ["5", 3, "HAGER"], ["5", 1, "YALE"],
  ]);
  assert.match(rows[0].component, /20-062/);
  assert.equal(rows.every((row) => row.sourcePage === 9), true);
});
