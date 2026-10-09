import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
// turbopackIgnore: the data dir is runtime state, not something to trace into the build output.
mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
// Only the app's OS user may read the database (mode is ignored by mkdir when the dir already exists).
chmodSync(/*turbopackIgnore: true*/ dir, 0o700);
const file = path.join(dir, "economy.db");

// One connection per server process; reused across hot reloads in dev.
const g = globalThis as unknown as { db?: DatabaseSync };
export const db = (g.db ??= open());

function open() {
  const d = new DatabaseSync(file);
  d.exec(`
    PRAGMA busy_timeout = 5000; -- first: other processes may be creating the schema concurrently
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY, public_key BLOB NOT NULL, counter INTEGER NOT NULL,
      transports TEXT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('courant','epargne')),
      initial_balance INTEGER NOT NULL DEFAULT 0, min_balance INTEGER
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL, amount INTEGER NOT NULL, date TEXT NOT NULL, category TEXT
    );
    CREATE INDEX IF NOT EXISTS tx_date ON transactions(date);
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      to_account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL, amount INTEGER NOT NULL, day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
      category TEXT, last_posted TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS planned (
      id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL, amount INTEGER NOT NULL, date TEXT NOT NULL, category TEXT
    );
  `);
  for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(/*turbopackIgnore: true*/ f)) chmodSync(/*turbopackIgnore: true*/ f, 0o600);
  const owned = d.prepare("SELECT 1 FROM settings WHERE key = 'password_hash'").get();
  if (!owned && process.env.NEXT_PHASE !== "phase-production-build") {
    // First run: whoever reaches the public URL first must not be able to claim the app.
    // A fresh code per start, stored hashed: only the container logs ever show it.
    const code = randomBytes(6).toString("hex");
    d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_code_hash', ?)").run(sha256(code));
    console.log(`\n[economy] Aucun compte créé. Code d'initialisation : ${code}\n`);
  }
  return d;
}

// function (hoisted): open() runs at module init, before later consts exist.
export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function getSetting(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}
export function setSetting(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

/** Runs fn inside a transaction (node:sqlite has no helper for it). */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
