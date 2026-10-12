import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDrawingPages } from "../lib/drawing-takeoff/page-selection";

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
