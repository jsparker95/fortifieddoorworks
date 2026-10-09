import { test } from "node:test";
import assert from "node:assert/strict";
import { documentDownloadFilename } from "../lib/documents";

test("label downloads include the selected label kind in the filename", () => {
  assert.equal(
    documentDownloadFilename("Joseph's House", "labels", "Anchors"),
    "Joseph_s_House-Anchors-labels.pdf",
  );
  assert.equal(
    documentDownloadFilename("Joseph's House", "labels", "Doors"),
    "Joseph_s_House-Doors-labels.pdf",
  );
  assert.equal(
    documentDownloadFilename("Joseph's House", "labels"),
    "Joseph_s_House-Doors-labels.pdf",
  );
});

test("non-label document filenames keep their existing format", () => {
  assert.equal(
    documentDownloadFilename("Joseph's House", "Takeoff", "Doors"),
    "Joseph_s_House-Takeoff.pdf",
  );
});
