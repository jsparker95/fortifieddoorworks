import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("projects, projects by id, and project phases have routable pages", () => {
  for (const route of [
    "app/projects/page.tsx",
    "app/projects/[projectId]/page.tsx",
    "app/projects/[projectId]/phases/[phaseId]/page.tsx",
  ]) {
    assert.match(read(route), /import Workspace from "@\/components\/workspace"/);
    assert.match(read(route), /return <Workspace \/>/);
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
