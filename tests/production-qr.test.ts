import assert from "node:assert/strict";
import test from "node:test";
import { productionWorkKindForLabel } from "../lib/production-qr";

test("printed label kinds map to their production work type", () => {
  assert.equal(productionWorkKindForLabel("Frames"), "frame");
  assert.equal(productionWorkKindForLabel("Doors"), "door");
  assert.equal(productionWorkKindForLabel("Hardware"), "hardware");
  assert.equal(productionWorkKindForLabel("anchors"), null);
  assert.equal(productionWorkKindForLabel(null), null);
});
