import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCatalogField, catalogFieldValue } from "../lib/catalog-settings";
import { sortCatalogs, catalogCreatedDate } from "../lib/catalog-settings";
import type { Catalog } from "../lib/types";

const rows = [
  { id: "a", category: "Door brands", value: "DCI", description: "Original" },
  { id: "b", category: "Windows", value: "Glass", description: "" },
];

test("creation sorting uses timestamps, puts unknowns last in both directions, and preserves input", () => {
  const data: Catalog[] = [
    { ...rows[0], id: "old", value: "Zulu", created_at: "2026-10-13T12:00:00Z" },
    { ...rows[0], id: "unknown", value: "Alpha", created_at: null },
    { ...rows[0], id: "new", value: "Bravo", created_at: "2026-10-14T12:00:00Z" },
    { ...rows[0], id: "invalid", value: "Delta", created_at: "invalid" },
    { ...rows[0], id: "tie", value: "Charlie", created_at: "2026-10-14T07:00:00-05:00" },
  ];
  assert.deepEqual(sortCatalogs(data, "newest").map((r) => r.id), ["new", "tie", "old", "unknown", "invalid"]);
  assert.deepEqual(sortCatalogs(data, "oldest").map((r) => r.id), ["old", "new", "tie", "unknown", "invalid"]);
  assert.deepEqual(sortCatalogs(data, "value").map((r) => r.id), ["unknown", "new", "tie", "invalid", "old"]);
  assert.deepEqual(data.map((r) => r.id), ["old", "unknown", "new", "invalid", "tie"]);
  assert.deepEqual(sortCatalogs(filterCatalogs(data, "Door brands", "bravo"), "newest").map((r) => r.id), ["new"]);
});

test("creation date displays unknown honestly and uses the workspace timezone", () => {
  assert.equal(catalogCreatedDate(rows[0]), "Unknown");
  assert.equal(catalogCreatedDate({ ...rows[0], created_at: "bad date" }), "Unknown");
  assert.equal(catalogCreatedDate({ ...rows[0], created_at: "2026-10-14T02:00:00Z" }), "Oct 13, 2026");
});

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

import { filterCatalogs, hardwareBrandId } from "../lib/catalog-settings";
import { hardwareDocumentType, hardwareDocumentPath, MAX_HARDWARE_DOCUMENT_SIZE } from "../lib/hardware-component-documents";

test("hardware search matches value or description case-insensitively within its category", () => {
  const data = [
    { id: "a", category: "Hardware components", value: "1608 Silencer", description: "Rubber stop" },
    { id: "b", category: "Hardware components", value: "Plate", description: "" },
    { id: "c", category: "Door brands", value: "Silencer", description: "Rubber" },
  ];
  assert.deepEqual(filterCatalogs(data, "Hardware components", " SILENCER "), [data[0]]);
  assert.deepEqual(filterCatalogs(data, "Hardware components", "RUBBER"), [data[0]]);
  assert.equal(filterCatalogs(data, "Hardware components", " ").length, 2);
  assert.equal(filterCatalogs(data, "Hardware components", "unknown").length, 0);
});
test("brand choices must resolve to the hardware brands list", () => {
  const data = [{ id: "brand", category: "Hardware brands", value: "Rockwood", description: "" }, ...rows];
  assert.equal(hardwareBrandId(data, " Rockwood "), "brand");
  assert.throws(() => hardwareBrandId(data, "DCI"), /Hardware brands/);
  assert.throws(() => hardwareBrandId(data, ""), /Hardware brands/);
});
test("documents enforce type, size, and safe component-specific paths", () => {
  assert.equal(hardwareDocumentType({ name: "Spec.PDF", size: MAX_HARDWARE_DOCUMENT_SIZE }), "application/pdf");
  assert.throws(() => hardwareDocumentType({ name: "spec.pdf", size: 0 }), /empty/);
  assert.throws(() => hardwareDocumentType({ name: "spec.pdf", size: MAX_HARDWARE_DOCUMENT_SIZE + 1 }), /20 MB/);
  assert.throws(() => hardwareDocumentType({ name: "script.html", size: 100 }), /Choose a PDF/);
  assert.equal(hardwareDocumentPath("component", "upload", "../my spec.pdf"), "component/upload/.._my_spec.pdf");
});
