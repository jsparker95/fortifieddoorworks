import assert from "node:assert/strict";
import test from "node:test";
import { formatProductionDuration } from "../lib/production-timer";

test("production timers show hours, minutes, and seconds", () => {
  assert.equal(formatProductionDuration(59_000), "00:00:59");
  assert.equal(formatProductionDuration(3_661_000), "01:01:01");
  assert.equal(formatProductionDuration(90_061_000), "25:01:01");
});

test("production timer rounds down and never displays a negative duration", () => {
  assert.equal(formatProductionDuration(1_999), "00:00:01");
  assert.equal(formatProductionDuration(-1), "00:00:00");
});
