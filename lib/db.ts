import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
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
    PRAGMA secure_delete = ON; -- erased data is overwritten, not left in free pages

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
  migrate(d);
  for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(/*turbopackIgnore: true*/ f)) chmodSync(/*turbopackIgnore: true*/ f, 0o600);
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const { n } = d.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    console.log(`[economy] Base ${file} : ${n} utilisateur(s).`);
    if (!persistent()) console.warn(`[economy] ATTENTION : ${dir} n'est pas un volume monté. Les données seront perdues si le conteneur est recréé.`);
    if (!n) issueSetupCode(d);
  }
  return d;
}

/**
 * Schema changes, applied once each in order and recorded in PRAGMA user_version.
 * Never edit a released step: add a new one, so existing databases upgrade in place on the next start.
 */
function migrate(d: DatabaseSync) {
  const steps = [
    // v1: multi-user. The single owner of a v0 database becomes the first admin and keeps all its data.
    () => {
      d.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')), currency TEXT NOT NULL DEFAULT 'EUR',
          created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login TEXT
        );
        ALTER TABLE accounts ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        ALTER TABLE credentials ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        CREATE INDEX accounts_user ON accounts(user_id);
      `);
      const get = (k: string) => (d.prepare("SELECT value FROM settings WHERE key = ?").get(k) as { value: string } | undefined)?.value;
      const hash = get("password_hash");
      if (hash) {
        const { lastInsertRowid: uid } = d.prepare("INSERT INTO users (username, password_hash, role, currency) VALUES (?, ?, 'admin', ?)")
          .run(get("username") ?? "admin", hash, get("currency") ?? "EUR");
        for (const t of ["accounts", "credentials", "sessions"]) d.prepare(`UPDATE ${t} SET user_id = ?`).run(uid);
      }
      d.exec("DELETE FROM settings WHERE key IN ('username', 'password_hash', 'currency')");
    },
  ];
  const version = (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = version; v < steps.length; v++) {
    d.exec("BEGIN IMMEDIATE");
    try {
      // Re-read inside the lock: another process (build worker) may have migrated meanwhile.
      if ((d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version > v) { d.exec("COMMIT"); continue; }
      steps[v]();
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  }
}

/** No user yet: whoever reaches the public URL first must not be able to claim the app.
 * A fresh code per start (and after a reset), stored hashed: only the server logs ever show it. */
export function issueSetupCode(d = db) {
  const code = randomBytes(6).toString("hex");
  d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_code_hash', ?)").run(sha256(code));
  console.log(`\n[economy] Aucun compte créé. Code d'initialisation : ${code}\n`);
}

/** True when the data dir is its own mount (Docker volume, Proxmox mount point), so it outlives the container.
 * Outside Linux containers there is nothing to check. */
export function persistent() {
  if (dir !== "/data") return true;
  try {
    return readFileSync("/proc/self/mountinfo", "utf8").split("\n").some((l) => l.split(" ")[4] === dir);
  } catch {
    return true;
  }
}

export const dbPath = file;

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
