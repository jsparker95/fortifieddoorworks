import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCatalogField, catalogFieldValue } from "../lib/catalog-settings";

const rows = [
  { id: "a", category: "Door brands", value: "DCI", description: "Original" },
  { id: "b", category: "Windows", value: "Glass", description: "" },
];

test("required settings values are trimmed and blank values rejected", () => {
  assert.equal(catalogFieldValue("value", "  DKS  "), "DKS");
  assert.throws(() => catalogFieldValue("value", " \n "), /cannot be empty/);
  assert.equal(catalogFieldValue("description", ""), "");
  assert.equal(catalogFieldValue("description", "Line one\nLine two"), "Line one\nLine two");
});

test("independent field saves preserve each other and other categories", () => {
  const descriptionFirst = applyCatalogField(rows, "a", "description", "New description");
  const valueSecond = applyCatalogField(descriptionFirst, "a", "value", "DKS");
  assert.deepEqual(valueSecond[0], { ...rows[0], value: "DKS", description: "New description" });
  assert.equal(valueSecond[1], rows[1]);
  assert.equal(rows[0].value, "DCI");
});

test("a late save cannot recreate a deleted setting", () => {
  assert.deepEqual(applyCatalogField(rows.slice(1), "a", "value", "DKS"), rows.slice(1));
});
