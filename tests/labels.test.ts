import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "../lib/types";
import { productionLabels } from "../lib/labels";
import { makeDocument } from "../lib/documents";
import { PDFDocument } from "pdf-lib";

function sample() {
  const data = emptyData();
  data.walls = [{ id: "wall", name: "W1", size: "575" }];
  data.doorTypes = [{ id: "type", name: "D1", material: "Wood", window: "Vision Lite", fire: "20 Min" }];
  data.hardware = [
    { id: "h1", group: "A", qty: 3, brand: "Hinges Inc", component: "Ball bearing hinge", veSelected: false },
    { id: "h2", group: "A", qty: 1, brand: "Lock Co", component: "Mortise lock", veSelected: true, veBrand: "Alt", veComponent: "Alt lock" },
    { id: "h3", group: "B", qty: 2, brand: "Closer Co", component: "Closer", veSelected: false },
  ];
  data.openings = [
    { id: "one", name: "101", width: "3/0", height: "7/0", wall: "W1", handing: "L", frameType: "Welded", anchor: "", anchorQty: 0, doorType: "D1", group: "A" },
    { id: "two", name: "102", width: "3/6", height: "8/0", wall: "W1", handing: "R", frameType: "KD", doorType: "D1", group: "B", deleted: true },
  ];
  return data;
}

test("frame labels carry legacy dimensions, handing colors, and frame details", () => {
  const labels = productionLabels(sample(), "Frames");
  assert.equal(labels.length, 1);
  assert.equal(labels[0].title, "101");
  assert.deepEqual(labels[0].lines.slice(0, 4).map((line) => line.text), ["W 3/0", "H 7/0", "D 575", "Hd L"]);
  assert.equal(labels[0].lines[0].color, "#FFFFFF");
  assert.equal(labels[0].lines[3].color, "#CFE2F3");
  assert.ok(labels[0].lines.some((line) => line.text === "Frame Type Welded"));
});

test("door labels preserve legacy material and window truncation and support stable selection", () => {
  const data = sample();
  data.doorTypes[0].material = "M".repeat(30);
  data.doorTypes[0].window = "W".repeat(30);
  const all = productionLabels(data, "Doors");
  assert.equal(all.length, 1);
  assert.equal(all[0].lines.find((line) => line.text.startsWith("Material"))?.text, `Material ${"M".repeat(22)}`);
  assert.equal(productionLabels(data, "Doors", ["unknown"]).length, 0);
  assert.equal(productionLabels(data, "Doors", ["one"])[0].item.id, "one");
});

test("hardware labels are per active opening, use selected alternates, and omit empty groups", () => {
  const data = sample();
  data.openings.push({ id: "three", name: "103", width: "3/0", height: "7/0", wall: "W1", doorType: "D1", group: "", handing: "R" });
  const labels = productionLabels(data, "Hardware");
  assert.deepEqual(labels.map((label) => label.title), ["101"]);
  assert.deepEqual(labels[0].lines.map((line) => line.text), [
    "3ea. Hinges Inc Ball bearing hinge",
    "1ea. Alt Alt lock",
  ]);
});

test("label PDF generation works per phase and respects selection without persisting duplicates", async () => {
  const data = sample();
  const phase = data.phases![0];
  phase.data = { ...phase.data, ...data };
  const project = {
    id: "project-id", name: "Job 42", building: "", contractor_id: null,
    start_date: null, pm: "", jobsite: "Site A", scope: "", cuts: "",
    status: "In production", source_id: null, data: { ...data, activePhaseId: phase.id, phases: [phase] },
    version: 1, updated_at: "2026-01-01T00:00:00.000Z",
  };
  const anchors = await makeDocument(project, "labels", { labelKind: "Anchors", contractor: "Builder" });
  assert.equal((await PDFDocument.load(anchors)).getPageCount(), 1, "Anchor package label");
  for (const kind of ["Frames", "Doors", "Hardware"]) {
    const bytes = await makeDocument(project, "labels", { labelKind: kind, contractor: "Builder" });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1, `${kind} active items`);
    await assert.rejects(
      makeDocument(project, "labels", { labelKind: kind, selected: ["missing"] }),
      /No openings selected/,
    );
  }
});
