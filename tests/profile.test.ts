import assert from "node:assert/strict";
import test from "node:test";
import {
  getProfileDisplayName,
  isValidAvatarFile,
  MAX_AVATAR_BYTES,
} from "../lib/profile";

test("profile name prefers the auth profile, then workspace name, then email", () => {
  assert.equal(getProfileDisplayName("Jordan Parker", "Jordan", "jordan@example.com"), "Jordan Parker");
  assert.equal(getProfileDisplayName("  ", "Jordan", "jordan@example.com"), "Jordan");
  assert.equal(getProfileDisplayName(null, null, "jordan@example.com"), "jordan");
});

test("avatar uploads allow small JPEG, PNG, and WebP files only", () => {
  assert.equal(isValidAvatarFile({ type: "image/jpeg", size: 400 }), true);
  assert.equal(isValidAvatarFile({ type: "image/png", size: MAX_AVATAR_BYTES }), true);
  assert.equal(isValidAvatarFile({ type: "image/webp", size: MAX_AVATAR_BYTES + 1 }), false);
  assert.equal(isValidAvatarFile({ type: "image/svg+xml", size: 400 }), false);
  assert.equal(isValidAvatarFile({ type: "image/jpeg", size: 0 }), false);
});
