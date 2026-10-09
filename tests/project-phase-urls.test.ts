import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("the workspace stays mounted across project and phase routes", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /import Workspace from "@\/components\/workspace"/);
  assert.match(layout, /<Workspace \/>/);

  for (const route of [
    "app/page.tsx",
    "app/projects/page.tsx",
    "app/settings/page.tsx",
    "app/contractors/page.tsx",
    "app/vendors/page.tsx",
    "app/projects/[projectId]/page.tsx",
    "app/projects/[projectId]/phases/[phaseId]/page.tsx",
  ]) {
    assert.match(read(route), /return null/);
  }
});

test("workspace navigation writes and restores project and phase URLs", () => {
  const workspace = read("components/workspace.tsx");
  assert.match(workspace, /router\.push\(`\/projects\/\$\{p\.id\}`\)/);
  assert.match(
    workspace,
    /router\.push\(`\/projects\/\$\{active\.id\}\/phases\/\$\{id\}`\)/,
  );
  assert.match(workspace, /routeParams\.projectId/);
  assert.match(workspace, /routeParams\.phaseId/);
  assert.match(workspace, /router\.push\(`\/projects\/\$\{active\.id\}`\)/);
});


test("Vendors has its own sidebar destination and route restoration", () => {
  const workspace = read("components/workspace.tsx");
  assert.match(workspace, /navigate\("Vendors"\)/);
  assert.match(workspace, /pathname === "\/vendors"\) setView\("Vendors"\)/);
  assert.match(workspace, /returnPath === "\/vendors"/);
  const vendorsStart = workspace.indexOf('!active && view === "Vendors"');
  const settingsStart = workspace.indexOf('!active && view === "Settings"');
  assert.ok(vendorsStart > 0 && settingsStart > vendorsStart);
  assert.match(workspace.slice(vendorsStart, settingsStart), /<VendorDirectory/);
  const settingsEnd = workspace.indexOf('{active && !phaseDetail', settingsStart);
  assert.doesNotMatch(workspace.slice(settingsStart, settingsEnd), /<VendorDirectory/);
});
