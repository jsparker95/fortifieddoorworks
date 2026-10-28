import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { planDetails } from "../lib/drawing-takeoff/plan-details";
import { renderCrop } from "../lib/drawing-takeoff/pdf-server";
import { resolveOpeningHanding } from "../lib/drawing-takeoff/schedule-evidence";
import { combineExtractionOutputs, sanitizeExtraction } from "../lib/drawing-takeoff/extraction-schema";

test("literal bifold and cased-opening schedule rows do not acquire swing hands", () => {
  for (const evidence of ["121 SOLID CORE WOOD BI-FOLD 14", "121 SOLID CORE WOOD BIFOLD 14", "112 N/A CASED OPENING"]) {
    assert.equal(resolveOpeningHanding({ evidence }, "RH"), "");
  }
});

test("an explicit numbered corridor reference is recognized without accepting incidental corridor mentions", () => {
  const row = { mark: "131", sourcePage: 1, boundingBox: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    hingeSide: "left" as const, swingDirection: "away_from_reference_side" as const, handing: "LH" as const,
    symbolEvidence: "attached tag and swing arc", confidence: 0.8 };
  const safe = sanitizeExtraction({ ...combineExtractionOutputs(null, null), doorwayObservations: [
    { ...row, handingEvidence: "Hinges left when viewed from Corridor 1, swing away into Bunk 9" },
    { ...row, handingEvidence: "A corridor 1 is near the opening; hinge left" },
    { ...row, handingEvidence: "Assumed reference from Corridor 1" },
  ] }, [2]);
  assert.deepEqual(safe.doorwayObservations.map(row => row.handing), ["LH", "", ""]);
});

test("detail crops locate each target in its overview, clamp to source page and cap image count", () => {
  const page = { page: 2, width: 1000, height: 800, rotation: 0, text: "", lines: [], boxes: [
    { text: "131", x: 250, y: 200, width: 20, height: 10 },
    { text: "132", x: 5, y: 5, width: 20, height: 10 },
    { text: "131", x: 900, y: 700, width: 20, height: 10 },
  ] };
  const details = planDetails(page, { x: 0, y: 0, width: 1000, height: 1000 }, ["131", "132", "131", "unseen"]);
  assert.deepEqual(details.map(detail => detail.mark), ["131", "132"]);
  assert.equal(details[0].overviewX, 520);
  assert.equal(details[0].overviewY, 410);
  assert.equal(details[1].x, 0);
  assert.equal(details[1].y, 0);
  assert.ok(details.every(detail => detail.width <= 400 && detail.height <= 400 && detail.x + detail.width <= 2000 && detail.y + detail.height <= 1600));
});

test("vector details render at four times scale while the bitmap stays bounded", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([500, 400]);
  const bytes = await pdf.save();
  const detail = await renderCrop(bytes, { x: 200, y: 200, width: 400, height: 400 }, 4);
  assert.equal(detail.readUInt32BE(16), 1600);
  assert.equal(detail.readUInt32BE(20), 1600);
  const bounded = await renderCrop(bytes, { x: 0, y: 0, width: 1000, height: 800 }, 4);
  assert.equal(bounded.readUInt32BE(16), 1800);
  assert.equal(bounded.readUInt32BE(20), 1440);
});
