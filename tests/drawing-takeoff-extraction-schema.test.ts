import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { combineExtractionOutputs, extractionSchema, planExtractionSchema, sanitizeExtraction, scheduleExtractionSchema } from "../lib/drawing-takeoff/extraction-schema";
import { mapAnalysisToPhaseRows } from "../lib/drawing-takeoff/phase-import";

test("PDF extraction schema does not send large array or numeric bounds to Gemini", () => {
  const json = JSON.stringify(z.toJSONSchema(extractionSchema));
  assert.equal(json.includes('"maxItems"'), false);
  assert.equal(json.includes('"minimum"'), false);
  assert.equal(json.includes('"maximum"'), false);
  for (const schema of [scheduleExtractionSchema, planExtractionSchema]) {
    assert.equal(JSON.stringify(z.toJSONSchema(schema)).includes('"maxItems"'), false);
  }
});

test("PDF extraction filters invalid citations and boxes after model generation", () => {
  const output = extractionSchema.parse({
    relevantPages: [{ page: 9, section: "Doors", reason: "Schedule", confidence: 1.4 }],
    walls: [], doorTypes: [], openings: [], hardwareGroups: [], specFindings: [],
    doorwayObservations: [
      { mark: "101", sourcePage: 9, boundingBox: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 }, hingeSide: "left", swingDirection: "away_from_reference_side", handing: "LH", handingEvidence: "hinge", symbolEvidence: "swing arc", confidence: 0.9 },
      { mark: "102", sourcePage: 9, boundingBox: { x: 0.95, y: 0.2, width: 0.1, height: 0.1 }, hingeSide: "right", swingDirection: "unclear", handing: "unclear", handingEvidence: "", symbolEvidence: "partial symbol", confidence: 0.5 },
      { mark: "103", sourcePage: 10, boundingBox: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 }, hingeSide: "right", swingDirection: "unclear", handing: "unclear", handingEvidence: "", symbolEvidence: "different page", confidence: 0.5 },
    ],
    uncertainties: [],
  });
  const safe = sanitizeExtraction(output, new Set([9]));
  assert.deepEqual(safe.doorwayObservations.map((row) => row.mark), ["101"]);
  assert.equal(safe.relevantPages[0].confidence, 1);
  assert.match(safe.uncertainties[0], /2 extraction item/);
});

test("shortened PDF citations map back to the original schedule page before phase import", () => {
  const schedule = scheduleExtractionSchema.parse({
    relevantPages: [{ page: 1, section: "Door schedule", reason: "table", confidence: 0.9 }],
    doorTypes: [],
    openings: [{ mark: "5", room: "Parts", width: "3'-0\"", height: "7'-0\"", handing: "", doorType: "C", frameType: "2", wallType: "", hardwareGroup: "5", fireRating: "", quantity: "1", sourcePage: 1, evidence: "door schedule row 5", confidence: 0.9 }],
    hardwareGroups: [{ group: "5", name: "Set 5", brand: "Hager", component: "hinge", quantity: 3, frameModification: "", doorModification: "", doorPrep: "", sourcePage: 1, evidence: "set 5 hinges", confidence: 0.9 }],
    specFindings: [], uncertainties: [],
  });
  const safe = sanitizeExtraction(combineExtractionOutputs(schedule, null), [9]);
  const rows = mapAnalysisToPhaseRows("sample-document", safe);
  assert.equal(safe.openings[0].sourcePage, 9);
  assert.equal(safe.hardwareGroups[0].sourcePage, 9);
  assert.equal(rows.openings?.[0].sourcePage, 9);
  assert.equal(rows.openings?.[0].group, "5");
  assert.equal(rows.hardware?.[0].group, "5");
});

test("traditional handing corrects reverse swing and withholds assumed reference sides", () => {
  const observed = (mark: string, hingeSide: "left" | "right", swingDirection: "toward_reference_side" | "away_from_reference_side", handing: "LH" | "RH", handingEvidence: string) => ({
    mark, sourcePage: 1, boundingBox: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
    hingeSide, swingDirection, handing, handingEvidence, symbolEvidence: "door arc", confidence: 0.8,
  });
  const plan = planExtractionSchema.parse({
    relevantPages: [], walls: [], uncertainties: [],
    doorwayObservations: [
      observed("8", "left", "toward_reference_side", "LH", "hinge and swing viewed from outside the building"),
      observed("9", "right", "toward_reference_side", "RH", "hinge and swing viewed from outside the building"),
      observed("12", "left", "away_from_reference_side", "LH", "assumed outside from room 103"),
    ],
  });
  const safe = sanitizeExtraction(combineExtractionOutputs(null, plan), [1, 9]);
  assert.deepEqual(safe.doorwayObservations.map((row) => row.handing), ["LHR", "RHR", ""]);
  assert.match(safe.uncertainties.at(-1) || "", /3 doorway hand/);
});

test("visual-only door guesses remain review candidates without entering phase tabs automatically", () => {
  const rows = mapAnalysisToPhaseRows("sample-document", {
    openings: [
      { mark: "5", sourcePage: 9, hardwareGroup: "5", quantity: "1" },
      { mark: "uncertain", sourcePage: 1, quantity: "1", autoImportEligible: false },
    ],
    hardwareGroups: [], doorTypes: [], walls: [],
  });
  assert.deepEqual(rows.openings?.map((row) => row.name), ["5"]);
});
