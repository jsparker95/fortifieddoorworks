import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData, type Catalog } from "../lib/types";
import { submittalDocuments } from "../lib/submittal-hardware-documents";
import { catalogBrandId } from "../lib/catalog-settings";
import { fields } from "../lib/fields";
import { PDFDocument } from "pdf-lib";
import { appendHardwareDocuments } from "../lib/submittal-hardware-documents";

const record = (id: string, category: string, value: string, extra: Partial<Catalog> = {}): Catalog => ({ id, category, value, description: "", ...extra });
const pdf = (id: string, category: string, value: string, brand_id?: string, match_value?: string): Catalog => record(id, category, value, { brand_id, match_value, document_path: `${id}/spec.pdf`, document_name: "spec.pdf" });
const catalogs = [record("db", "Door brands", "Door Co"), record("fb", "Frame brands", "Frame Co"),
  pdf("door", "Door cutsheets", "Door series", "db", "HM Door"), pdf("frame", "Frame cutsheets", "Frame series", "fb", "Welded"),
  pdf("window", "Windows", "Vision lite"), pdf("hinge", "Hardware components", "Hinge")];
function sample() {
  const data = emptyData();
  data.walls = [{ id: "w", name: "W", brand: "Frame Co" }];
  data.doorTypes = [{ id: "d", name: "D", brand: "Door Co", material: "HM Door", window: "Vision lite" }, { id: "unused", name: "Unused", brand: "Other", material: "Other" }];
  data.openings = [{ id: "o", name: "101", wall: "W", frameType: "Welded", doorType: "D", group: "A" }, { id: "o2", name: "102", wall: "W", frameType: "Welded", doorType: "D", group: "A" }];
  data.hardware = [{ id: "h", group: "A", component: "Hinge", qty: 3 }];
  return data;
}
test("submittals include used door, window, frame and hardware sheets once, in that order", () => {
  assert.deepEqual(submittalDocuments(sample(), catalogs).map((c) => c.id), ["door", "window", "frame", "hinge"]);
  const data = sample(); data.openings.forEach((o) => { o.wall = "NA"; o.doorType = "NA"; });
  assert.deepEqual(submittalDocuments(data, catalogs).map((c) => c.id), ["hinge"]);
});
test("brand-specific automatic matching never picks another manufacturer", () => {
  const data = sample(); data.doorTypes[0].brand = "Other"; data.openings.forEach((o) => o.brand = "Other");
  assert.deepEqual(submittalDocuments(data, catalogs).map((c) => c.id), ["window", "hinge"]);
});
test("ambiguous series require an explicit compatible schedule choice", () => {
  const data = sample(); const other = pdf("other", "Door cutsheets", "Other series", "db", "HM Door");
  assert.throws(() => submittalDocuments(data, [...catalogs, other]), /Choose a cutsheet for door type D/);
  data.doorTypes[0].cutsheet = "Other series";
  assert.equal(submittalDocuments(data, [...catalogs, other])[0].id, "other");
  data.doorTypes[0].brand = "Different";
  assert.throws(() => submittalDocuments(data, [...catalogs, other]), /does not match/);
  data.doorTypes[0].cutsheet = "Removed";
  assert.throws(() => submittalDocuments(data, catalogs), /unavailable/);
});
test("identical PDFs assigned to distinct products are appended once by content hash", () => {
  const hash = "a".repeat(64);
  const shared = catalogs.map((c) => ["door", "frame", "hinge"].includes(c.id) ? { ...c, document_sha256: hash } : c);
  assert.deepEqual(submittalDocuments(sample(), shared).map((c) => c.id), ["door", "window"]);
});
test("door and frame references use their existing brand lists and schedule selectors", () => {
  assert.equal(catalogBrandId(catalogs, "Door cutsheets", "Door Co"), "db");
  assert.throws(() => catalogBrandId(catalogs, "Frame cutsheets", "Door Co"), /Frame brands/);
  assert.deepEqual(fields("doorTypes", sample(), catalogs).find((f) => f.key === "cutsheet")?.options, ["Door series"]);
  assert.deepEqual(fields("openings", sample(), catalogs).find((f) => f.key === "frameCutsheet")?.options, ["Frame series"]);
});

test("legacy uploads without stored hashes still merge identical PDF content once", async () => {
  const source = await PDFDocument.create(); source.addPage([500, 700]);
  const bytes = await source.save();
  const output = await PDFDocument.create(); output.addPage();
  await appendHardwareDocuments(output, [pdf("one", "Hardware components", "Part one"), pdf("two", "Hardware components", "Part two")], async () => bytes);
  assert.equal(output.getPageCount(), 2);
});


test("unreviewed door types and wall brand fallbacks cannot add cutsheets to reviewed openings", () => {
  const data = sample();
  data.doorTypes[0].reviewState = "ai-draft";
  data.walls[0].reviewState = "ai-draft";
  assert.deepEqual(submittalDocuments(data, catalogs).map((c) => c.id), ["hinge"]);
});
