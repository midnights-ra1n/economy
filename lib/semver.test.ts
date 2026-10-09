import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewer, nextVersion } from "./semver.ts";

test("versions compare numerically, not as text", () => {
  assert.equal(isNewer("0.1.10", "0.1.9"), true);
  assert.equal(isNewer("v1.0.0", "0.9.9"), true);
  assert.equal(isNewer("0.1.2", "0.1.2"), false);
  assert.equal(isNewer("0.1.2", "0.2.0"), false);
});

test("the next release bumps the patch, unless package.json is ahead", () => {
  assert.equal(nextVersion("0.1.0", null), "0.1.0");
  assert.equal(nextVersion("0.1.0", "v0.1.0"), "0.1.1");
  assert.equal(nextVersion("0.1.0", "v0.1.9"), "0.1.10");
  assert.equal(nextVersion("0.2.0", "v0.1.9"), "0.2.0");
  assert.equal(nextVersion("1.0.0", "v0.4.2"), "1.0.0");
});
