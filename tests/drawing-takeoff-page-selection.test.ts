import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeFloorPlanSheet, selectDrawingPages, selectExtractionPageGroups } from "../lib/drawing-takeoff/page-selection";

test("distinguishes a floor plan title from detail-sheet references", () => {
  assert.equal(looksLikeFloorPlanSheet("1 FLOOR PLAN SCALE: 1/8 inch = 1 foot"), true);
  assert.equal(looksLikeFloorPlanSheet("A102 OVERALL SECOND LEVEL FLOOR PLAN"), true);
  assert.equal(looksLikeFloorPlanSheet("Overall Main Level Floor Plan"), true);
  assert.equal(looksLikeFloorPlanSheet("REFER TO OVERALL FLOOR PLAN FOR RESTROOM ORIENTATION"), false);
  assert.equal(looksLikeFloorPlanSheet("DOOR, REFER TO FLOOR PLAN AND DOOR SCHEDULE"), false);
});

test("manual floor plan and schedule pages reach their respective extraction tasks", () => {
  const ranked = [
    { page: 1, text: "1 FLOOR PLAN SCALE: 1/8 inch", score: 5, labels: [] },
    { page: 9, text: "DOOR SCHEDULE DOOR HARDWARE SCHEDULE", score: 12, labels: [] },
  ];
  const result = selectExtractionPageGroups(ranked, [9], [1, 9]);
  assert.deepEqual(result.schedulePages.map((page) => page.page), [9]);
  assert.deepEqual(result.planPages.map((page) => page.page), [1]);
});

test("analyzes every page in a short searchable plan PDF even without keyword matches", () => {
  const pages = [1, 2, 3].map((page) => ({
    page,
    text: `Overall ${["Main", "Second", "Third"][page - 1]} Level Floor Plan`,
    score: 0,
    labels: [],
  }));
  const result = selectDrawingPages(pages, [], [], 3);
  assert.deepEqual(result.ranked.map((page) => page.page), [1, 2, 3]);
  assert.equal(result.ranked[0].text, "Overall Main Level Floor Plan");
});

test("long PDFs keep keyword-ranked pages and sample scanned sheets across the file", () => {
  const pages = Array.from({ length: 30 }, (_, index) => ({
    page: index + 1,
    text: `Sheet ${index + 1}`,
    score: index === 5 ? 12 : 0,
    labels: index === 5 ? ["Door schedule"] : [],
  }));
  const result = selectDrawingPages(pages, [1, 10, 20, 30], [], 30, 10, 3);
  assert.ok(result.ranked.some((page) => page.page === 6));
  assert.deepEqual(result.ranked.filter((page) => page.labels[0]?.startsWith("Scanned")).map((page) => page.page), [1, 20, 30]);
});
