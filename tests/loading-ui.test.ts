import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("workspace does not render a separate full-page loading screen", () => {
  const workspace = readFileSync("components/workspace.tsx", "utf8");
  assert.match(workspace, /if \(loading\)\s*return null/);
  assert.doesNotMatch(workspace, /Loading your workspace/);
  assert.doesNotMatch(workspace, /className="loading"/);
});

test("the error recovery page uses the normal light app background", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const errorStyle = css.match(/\.error-screen\s*\{([^}]+)\}/)?.[1];

  assert.ok(errorStyle, "the error recovery style exists");
  assert.match(errorStyle, /background:\s*var\(--bg\)/);
  assert.doesNotMatch(errorStyle, /#17212c|#1[0-9a-f]{5}/i);
});
