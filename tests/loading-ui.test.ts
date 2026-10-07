import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("all full-page loading screens use the normal light app background", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const loadingStyle = css.match(/\.loading\s*\{([^}]+)\}/)?.[1];

  assert.ok(loadingStyle, "the shared loading style exists");
  assert.match(loadingStyle, /background:\s*var\(--bg\)/);
  assert.doesNotMatch(loadingStyle, /#17212c|#1[0-9a-f]{5}/i);
});
