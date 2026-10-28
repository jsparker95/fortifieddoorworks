import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlanResponse } from "../lib/drawing-takeoff/plan-response";
import { combineExtractionOutputs, sanitizeExtraction } from "../lib/drawing-takeoff/extraction-schema";

test("declared per-thousand model boxes become normalized page detections", () => {
  const row = { mark: "131", sourcePage: 1, boundingBox: { x: 470, y: 490, width: 80, height: 80 },
    hingeSide: "left", swingDirection: "away_from_reference_side", handing: "LH",
    handingEvidence: "Hinge and swing viewed from the corridor side", symbolEvidence: "Attached door tag and leaf", confidence: 0.8 };
  const raw = { coordinateSystem: "0-1000", doorwayObservations: [row] };
  const normalized = normalizePlanResponse(raw);
  const safe = sanitizeExtraction({ ...combineExtractionOutputs(null, null), ...normalized }, [2]);
  assert.equal(safe.doorwayObservations.length, 1);
  assert.deepEqual(safe.doorwayObservations[0].boundingBox, { x: 0.47, y: 0.49, width: 0.08, height: 0.08 });
  assert.equal(safe.doorwayObservations[0].sourcePage, 2);
  assert.deepEqual(raw.doorwayObservations[0].boundingBox, row.boundingBox);
  assert.throws(() => normalizePlanResponse({ ...raw, coordinateSystem: "pixels" }));
  const invalid = normalizePlanResponse({ ...raw, doorwayObservations: [{ ...row, boundingBox: { x: 990, y: 490, width: 80, height: 80 } }] });
  assert.equal(sanitizeExtraction({ ...combineExtractionOutputs(null, null), ...invalid }, [2]).doorwayObservations.length, 0);
});
