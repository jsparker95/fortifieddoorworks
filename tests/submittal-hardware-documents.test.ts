import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { newProject, type Catalog } from "../lib/types";
import { makeDocument } from "../lib/documents";
import { appendHardwareDocuments, submittalHardwareDocuments } from "../lib/submittal-hardware-documents";

const catalog = (value: string, path = `${value}.pdf`, name = path): Catalog => ({ id: value, category: "Hardware components", value, description: "", document_path: path, document_name: name });
function sample() {
  const project = newProject();
  project.name = "Submittal verification";
  project.data.openings = [
    { id: "o1", name: "101", group: "A" }, { id: "o2", name: "102", group: "A" },
    { id: "deleted", name: "103", group: "B", deleted: true },
    { id: "draft", name: "104", group: "C", reviewState: "ai-draft" },
  ];
  project.data.hardware = [
    { id: "h1", group: "A", qty: 3, component: " HINGE " },
    { id: "h2", group: "A", qty: 1, component: "Original lock", veSelected: true, veComponent: "Alternate lock" },
    { id: "h3", group: "A", qty: 1, component: "Hinge" },
    { id: "h4", group: "B", qty: 1, component: "Deleted opening part" },
    { id: "h5", group: "C", qty: 1, component: "Draft opening part" },
    { id: "h6", group: "Unused", qty: 1, component: "Unused part" },
    { id: "h7", group: "A", qty: 0, component: "Zero quantity" },
    { id: "h8", group: "A", qty: 1, component: "Draft hardware", reviewState: "ai-draft" },
    { id: "h9", group: "A", qty: 1, component: "Deleted hardware", deleted: true },
    { id: "h10", group: "A", qty: 1, component: "Text file" },
  ];
  project.data.phases![0].data = structuredClone(project.data);
  return project;
}
const catalogs = [catalog("Hinge"), catalog("Alternate lock", "alt.PDF"), catalog("Original lock"),
  ...["Deleted opening part", "Draft opening part", "Unused part", "Zero quantity", "Draft hardware", "Deleted hardware"].map((name) => catalog(name)),
  catalog("Text file", "part.txt"), catalog("Unattached", ""), { ...catalog("Hinge"), category: "Hardware brands" }];

test("selects PDFs used by eligible openings, honors alternatives and deduplicates in hardware order", () => {
  assert.deepEqual(submittalHardwareDocuments(sample().data, catalogs).map((c) => c.document_path), ["Hinge.pdf", "alt.PDF"]);
  const project = sample();
  project.data.hardware.push({ id: "shared", group: "A", qty: 1, component: "Same document" });
  assert.equal(submittalHardwareDocuments(project.data, [...catalogs, catalog("Same document", "Hinge.pdf")]).length, 2);
});

test("appends all source pages after the submittal while retaining page dimensions and rotation", async () => {
  const project = sample();
  // A different phase must never contribute documents to this phase's submittal.
  project.data.phases!.push({ ...project.data.phases![0], id: "other", name: "Other phase", data: { ...project.data.phases![0].data, hardware: [{ id: "other", group: "A", qty: 1, component: "Unused part" }] } });
  const base = await PDFDocument.load(await makeDocument(project, "Submittal"));
  const hinge = await PDFDocument.create();
  hinge.addPage([450, 600]);
  hinge.addPage([800, 500]).setRotation(degrees(90));
  const lock = await PDFDocument.create();
  lock.addPage([500, 700]);
  const files = new Map([["Hinge.pdf", await hinge.save()], ["alt.PDF", await lock.save()]]);
  const requests: string[] = [];
  const merged = await PDFDocument.load(await makeDocument(project, "Submittal", { catalogs, loadHardwareDocument: async (path) => {
    requests.push(path); return files.get(path)!;
  } }));
  assert.deepEqual(requests, ["Hinge.pdf", "alt.PDF"]);
  assert.equal(merged.getPageCount(), base.getPageCount() + 3);
  assert.deepEqual(merged.getPages().slice(base.getPageCount()).map((p) => [p.getWidth(), p.getHeight(), p.getRotation().angle]), [[450, 600, 0], [800, 500, 90], [500, 700, 0]]);
});

test("unavailable and invalid PDFs fail generation with the affected component", async () => {
  for (const load of [undefined, async () => { throw new Error("Download failed"); }, async () => new Uint8Array([1, 2, 3])]) {
    await assert.rejects(appendHardwareDocuments(await PDFDocument.create(), [catalog("Hinge")], load), /Could not append the hardware PDF for Hinge/);
  }
});

test("other document exports never request hardware PDFs", async () => {
  await makeDocument(sample(), "Takeoff", { catalogs, loadHardwareDocument: async () => { throw new Error("Should not download"); } });
});
