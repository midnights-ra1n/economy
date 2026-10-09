import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("secrets round-trip, are not stored in clear, and the key file is private", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "economy-"));
  process.env.DATA_DIR = dir;
  const { seal, unseal } = await import("./secret.ts");
  const sealed = seal("mot-de-passe-smtp");
  assert.ok(!sealed.includes("mot-de-passe-smtp"));
  assert.notEqual(seal("mot-de-passe-smtp"), sealed, "random IV");
  assert.equal(unseal(sealed), "mot-de-passe-smtp");
  assert.equal(statSync(path.join(dir, "secret.key")).mode & 0o777, 0o600);
  assert.equal(unseal(sealed.replace(/.$/, (c) => (c === "A" ? "B" : "A"))), null, "tampered value rejected");
});
