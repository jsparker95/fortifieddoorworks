import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { submittalLayout } from "../lib/submittal-layout";
import { makeDocument } from "../lib/documents";
import { newProject } from "../lib/types";

async function fonts() {
  const pdf = await PDFDocument.create();
  return { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
}
function project() {
  const p = newProject(); p.name = "Sample project"; p.scope = "Provide doors, frames and hardware.";
  const data = p.data.phases![0].data;
  data.openings = [{ id: "o1", name: "101", group: "A", wall: "NA", doorType: "NA" }];
  data.hardware = [{ id: "h1", group: "A", qty: 1, component: "Lock", brand: "Brand" }];
  return p;
}

test("submittal follows the sample's cover, opening list and intentionally blank divider", async () => {
  const p = project();
  const pages = submittalLayout(p, await fonts(), "General Contractor", new Date("2026-10-12T12:00:00Z"));
  assert.deepEqual(pages.map((p) => p.kind), ["cover", "openings", "divider"]);
  assert.equal(pages[0].rule, true);
  assert.ok(pages[0].text.some((t) => t.text === "General Contractor: General Contractor"));
  assert.ok(pages[0].text.some((t) => t.red && t.text === "Submittal: October 12, 2026"));
  assert.ok(pages[0].text.some((t) => t.text === "1. Provide doors, frames and hardware."));
  assert.deepEqual(pages[1].text.map((t) => t.text), ["101:", "Frame provided by others", "Door provided by others", "1ea. Brand Lock"]);
  assert.equal(pages[2].text.length, 1);
  assert.equal(pages[2].text[0].text, "This page intentionally left blank");
  assert.equal((await PDFDocument.load(await makeDocument(p, "Submittal"))).getPageCount(), 3);
});

test("long cover details wrap within margins and continue before the opening lists", async () => {
  const p = project(); const f = await fonts();
  p.name = "Long project name ".repeat(7);
  p.scope = "Detailed scope of work with dimensions and fabrication notes. ".repeat(170);
  p.cuts = "Long reference " + "X".repeat(350);
  const pages = submittalLayout(p, f, "Long contractor name ".repeat(9));
  assert.ok(pages.filter((p) => p.kind === "cover").length > 1);
  assert.equal(pages.at(-2)?.kind, "openings");
  for (const page of pages) for (const text of page.text) {
    assert.ok(text.y >= 60 && text.y <= 720, text.text);
    const width = (text.bold ? f.bold : f.regular).widthOfTextAtSize(text.text, text.size) * (text.scaleX || 1);
    assert.ok(text.x + width <= 540.1, text.text);
  }
});

test("ordinary openings stay together and oversized hardware lists continue without clipping", async () => {
  const p = project(); const data = p.data.phases![0].data;
  data.openings = Array.from({ length: 8 }, (_,i) => ({ id: `o${i}`, name: `${101+i}`, group: "A", wall: "NA", doorType: "NA" }));
  data.hardware = Array.from({ length: 10 }, (_,i) => ({ id: `h${i}`, group: "A", qty: 1, component: `Part ${i}`, brand: "Brand" }));
  let pages = submittalLayout(p, await fonts());
  for (const name of data.openings.map((o) => o.name)) {
    const page = pages.find((page) => page.text.some((t) => t.text === `${name}:`))!;
    const heading = page.text.findIndex((t) => t.text === `${name}:`);
    assert.equal(page.text[heading + 12].text, "1ea. Brand Part 9");
  }
  data.openings = [data.openings[0]];
  data.hardware = Array.from({ length: 100 }, (_,i) => ({ id: `h${i}`, group: "A", qty: 1, component: `Part ${i}`, brand: "Brand" }));
  pages = submittalLayout(p, await fonts());
  assert.ok(pages.some((page) => page.text.some((t) => t.text === "101 (continued):")));
  assert.ok(pages.some((page) => page.text.some((t) => t.text === "1ea. Brand Part 99")));
  assert.ok(pages.every((page) => page.text.every((text) => text.y >= 60)));
});
