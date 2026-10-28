import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inventoryOpeningRows, reconcileInventoriedRows } from "../lib/drawing-takeoff/indexing";
import { mapAnalysisToPhaseRows } from "../lib/drawing-takeoff/phase-import";
import { derive } from "../lib/production";
import { emptyData } from "../lib/types";
import { fields } from "../lib/fields";

const source = () => inventoryOpeningRows(JSON.parse(fs.readFileSync("tests/fixtures/schedules/rockingham-13.json", "utf8")));

test("each opening retains its own printed materials, finish, thickness and rating", () => {
  const rows = source();
  assert.equal(rows.filter(row => row.doorMaterial).length, 53);
  assert.equal(rows.filter(row => row.fireRating).length, 16);
  assert.equal(rows.find(row => row.mark === "109")?.doorMaterial, "SOLID CORE WOOD");
  const metal = rows.find(row => row.mark === "120")!;
  assert.equal(metal.doorType, "H");
  assert.equal(metal.doorMaterial, "INSULATED HOLLOW METAL");
  assert.equal(metal.frameMaterial, "HOLLOW METAL");
  assert.equal(metal.doorFinish, "PAINT");
  assert.equal(metal.doorThickness, `0'-1 3/4"`);
  const enriched = reconcileInventoriedRows([metal], [{ ...metal, fireRating: "90 MIN", frameType: "KD" }])[0];
  assert.equal(enriched.fireRating, "");
  assert.equal(enriched.frameType, "");
  const cased = rows.find(row => row.mark === "112")!;
  assert.equal(reconcileInventoriedRows([cased], [{ ...cased, hardwareGroup: "99" }])[0].hardwareGroup, "");
  const fulks = inventoryOpeningRows(JSON.parse(fs.readFileSync("tests/fixtures/schedules/rockingham-27.json", "utf8")));
  assert.equal(fulks.filter(row => row.doorMaterial).length, 54);
  assert.equal(fulks.find(row => row.mark === "107-F")?.fireRating, "90 MIN");
});

test("literal fire ratings populate the displayed editor field and override generic type assumptions", () => {
  const data = emptyData();
  const rows = source().filter(row => ["119", "120"].includes(row.mark));
  data.openings = mapAnalysisToPhaseRows("doc", { openings: rows }).openings!.map(row => ({ ...row, reviewState: "human-reviewed" }));
  data.doorTypes = [{ id: "type", name: "H", material: "SOLID CORE WOOD", fire: "90 MIN" }];
  const fireField = fields("openings", data, []).find(field => field.label === "Opening fire rating")!;
  assert.equal(data.openings[0][fireField.key], "20 MIN");
  const doors = derive(data).doors;
  assert.equal(doors.find(row => row.name === "119")?.fire, "20 MIN");
  assert.equal(doors.find(row => row.name === "120")?.fire, "");
  assert.ok(doors.every(row => row.material === "INSULATED HOLLOW METAL"));
});

test("fractional inches remain readable when normalizing printed dimensions", () => {
  const [row] = inventoryOpeningRows({ page: 1, text: `DOOR SCHEDULE WIDTH HEIGHT THICKNESS TYPE DOOR MATERIAL FINISH FRAME MATERIAL HARDWARE HARDWARE SET FIRE RATING 101 3' - 0 1/2" 7' - 0" 0' - 1 3/4" H SOLID CORE WOOD PAINT HOLLOW METAL PASSAGE 11` });
  assert.equal(row.width, `3'-0 1/2"`);
  assert.equal(row.doorThickness, `0'-1 3/4"`);
});

test("the same opening mark in separate source buildings is not a duplicate", () => {
  const data = emptyData();
  data.openings = [{ id: "a", name: "101", sourceBuilding: "DAYTON" }, { id: "b", name: "101", sourceBuilding: "FULKS RUN" }];
  assert.ok(!derive(data).warnings.some(warning => warning.includes("duplicate opening")));
  data.openings[1].sourceBuilding = "DAYTON";
  assert.equal(derive(data).warnings.filter(warning => warning.includes("duplicate opening")).length, 2);
});
