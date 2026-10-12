import test from "node:test";
import assert from "node:assert/strict";
import {
  settingsCategoryFromSearch,
  settingsSectionUrl,
} from "../lib/settings-sections";

test("settings section query restores categories using stable slugs", () => {
  assert.equal(settingsCategoryFromSearch("?section=door-materials"), "Door materials");
  assert.equal(settingsCategoryFromSearch("?section=hardware-components"), "Hardware components");
});

test("invalid settings sections fall back to Door brands", () => {
  assert.equal(settingsCategoryFromSearch("?section=not-a-section"), "Door brands");
  assert.equal(settingsCategoryFromSearch(""), "Door brands");
});

test("settings section links preserve other query parameters", () => {
  assert.equal(
    settingsSectionUrl("?source=shortcut", "Frame modifications"),
    "/settings?source=shortcut&section=frame-modifications",
  );
});
