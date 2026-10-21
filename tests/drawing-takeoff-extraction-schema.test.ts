import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { extractionSchema, sanitizeExtraction } from "../lib/drawing-takeoff/extraction-schema";

test("PDF extraction schema does not send large array or numeric bounds to Gemini", () => {
  const json = JSON.stringify(z.toJSONSchema(extractionSchema));
  assert.equal(json.includes('"maxItems"'), false);
  assert.equal(json.includes('"minimum"'), false);
  assert.equal(json.includes('"maximum"'), false);
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
