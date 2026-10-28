import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InfiniteRecordTable } from "../components/infinite-record-table";

function renderSchedule(total: number) {
  return renderToStaticMarkup(createElement(InfiniteRecordTable<number>, {
    rows: Array.from({ length: total }, (_, i) => i + 1),
    className: "table-scroll",
    label: "Openings schedule",
    children: (rows) => createElement("table", null, createElement("tbody", null,
      rows.map((row) => createElement("tr", { key: row }, createElement("td", null, `Opening ${row}`))),
    )),
  }));
}

test("large schedules initially show exactly 150 records in order", () => {
  const html = renderSchedule(451);
  assert.equal((html.match(/<tr>/g) || []).length, 150);
  assert.ok(html.indexOf("Opening 1<") < html.indexOf("Opening 150<"));
  assert.doesNotMatch(html, /Opening 151</);
  assert.match(html, /Showing 150 of 451 records/);
  assert.match(html, /Scroll down for more/);
  assert.match(html, /role="region" tabindex="0" aria-label="Openings schedule"/);
  assert.doesNotMatch(html, /<button|Previous|Next/);
});

for (const total of [0, 91, 150]) {
  test(`a schedule with ${total} records shows all records without loading more`, () => {
    const html = renderSchedule(total);
    assert.equal((html.match(/<tr>/g) || []).length, total);
    assert.match(html, new RegExp(`Showing ${total} of ${total} records`));
    assert.doesNotMatch(html, /Scroll down for more/);
  });
}
