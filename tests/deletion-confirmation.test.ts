import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDeleteConfirmation } from "../lib/deletion-confirmation";

test("delete confirmation ignores collapsed whitespace and equivalent dash styles", () => {
  const storedName = "Door Type  WD.4 - Intermountain Utah Valley Sports Performance Center";
  const typedName = "Door Type WD.4 – Intermountain Utah Valley Sports Performance Center";

  assert.equal(normalizeDeleteConfirmation(typedName), normalizeDeleteConfirmation(storedName));
});

test("delete confirmation still requires the project name and its capitalization", () => {
  const name = "Joseph’s House";

  assert.notEqual(normalizeDeleteConfirmation("Delete project"), normalizeDeleteConfirmation(name));
  assert.notEqual(normalizeDeleteConfirmation("joseph’s house"), normalizeDeleteConfirmation(name));
});
