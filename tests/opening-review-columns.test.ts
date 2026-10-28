import test from "node:test";
import assert from "node:assert/strict";
import { openingReviewColumns } from "../lib/opening-review-columns";

test("plan-review columns put mark, size and hand first without losing source fields", () => {
  const columns = ["name", "brand", "frameSupplier", "width", "height", "wall", "handing", "frameType", "doorType", "fire", "doorMaterial", "group"]
    .map(key => ({ key, label: key }));
  const result = openingReviewColumns(columns);
  assert.deepEqual(result.map(c => c.key), ["name", "width", "height", "handing", "doorType", "group", "fire", "brand", "frameSupplier", "wall", "frameType", "doorMaterial"]);
  assert.equal(result.length, columns.length);
  assert.equal(columns[1].key, "brand");
  assert.ok(result.every(column => columns.includes(column)));
});
