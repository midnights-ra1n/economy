import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// db.ts opens DATA_DIR at import: each test points it at a fresh dir and loads a new module instance.
async function openDb(dir: string, tag: string) {
  process.env.DATA_DIR = dir;
  delete (globalThis as { db?: unknown }).db;
  return (await import(`./db.ts?${tag}`)).db as DatabaseSync;
}

test("a single-user (v0) database upgrades in place: the owner becomes admin and keeps everything", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "economy-"));
  const old = new DatabaseSync(path.join(dir, "economy.db"));
  old.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE credentials (id TEXT PRIMARY KEY, public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, initial_balance INTEGER NOT NULL DEFAULT 0, min_balance INTEGER);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, label TEXT NOT NULL, amount INTEGER NOT NULL, date TEXT NOT NULL, category TEXT);
    INSERT INTO settings VALUES ('username', 'moi'), ('password_hash', 'scrypt:aa:bb'), ('currency', 'USD');
    INSERT INTO accounts VALUES (1, 'Courant', 'courant', 10000, NULL);
    INSERT INTO transactions VALUES (1, 1, 'Courses', -4200, '2026-10-01', NULL);
    INSERT INTO credentials (id, public_key, counter, name) VALUES ('cred', x'00', 0, 'Mac');
    INSERT INTO sessions VALUES ('tok', 9999999999999);
  `);
  old.close();

  const db = await openDb(dir, "v0");
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 3);
  assert.deepEqual({ ...db.prepare("SELECT id, username, password_hash, role, currency FROM users").get() },
    { id: 1, username: "moi", password_hash: "scrypt:aa:bb", role: "admin", currency: "USD" });
  for (const t of ["accounts", "credentials", "sessions"]) {
    assert.equal((db.prepare(`SELECT user_id FROM ${t}`).get() as { user_id: number }).user_id, 1, t);
  }
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n, 1);
  assert.equal(db.prepare("SELECT 1 FROM settings WHERE key IN ('username', 'password_hash', 'currency')").get(), undefined);
  // Deleting the user cascades to all of its data.
  db.exec("DELETE FROM users");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n, 0);
});

test("a fresh database gets the current schema and opens the account creation window", async () => {
  const db = await openDb(mkdtempSync(path.join(tmpdir(), "economy-")), "fresh");
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 3);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n, 0);
  const { setupMinutesLeft } = (await import(`./db.ts?${"fresh"}`)) as typeof import("./db.ts"); // same instance as openDb
  assert.ok(setupMinutesLeft() > 0 && setupMinutesLeft() <= 10);
});
