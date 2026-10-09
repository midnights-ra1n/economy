import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, sha256 } from "./db";
import type { Locale } from "./i18n";

export const ORIGIN = (process.env.ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
export const RP_ID = new URL(ORIGIN).hostname;
const SECURE = ORIGIN.startsWith("https://");
const SESSION_COOKIE = "session";
const CHALLENGE_COOKIE = "webauthn";
const SESSION_DAYS = 30;

const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: SECURE, sameSite: "lax" as const, path: "/", maxAge });

export type User = { id: number; username: string; role: "admin" | "user"; currency: string; locale: Locale | null };

/** The logged-in user, read once per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // Only the hash is stored, so a leaked DB file does not leak live sessions.
  return (db.prepare(`
    SELECT u.id, u.username, u.role, u.currency, u.locale FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(sha256(token), Date.now()) as User | undefined) ?? null;
});

export const isLoggedIn = async () => !!(await currentUser());

/** Call at the top of every page, route and server action that touches budget data. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Same, for the admin panel and its actions: anyone else is sent back home. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, expires_at, user_id) VALUES (?, ?, ?)").run(sha256(token), Date.now() + SESSION_DAYS * 864e5, userId);
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(SESSION_DAYS * 86400));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  jar.delete(SESSION_COOKIE);
}

/** Logs a user out of every device (password change or reset, by them or an admin). */
export function destroyAllSessions(userId: number) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

// Challenges live server-side (single use, 5 min) so a captured assertion cannot be replayed.
export async function saveChallenge(challenge: string) {
  const id = randomBytes(16).toString("base64url");
  db.prepare("DELETE FROM challenges WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO challenges (id, challenge, expires_at) VALUES (?, ?, ?)").run(id, challenge, Date.now() + 5 * 60e3);
  (await cookies()).set(CHALLENGE_COOKIE, id, cookieOpts(300));
}

export async function takeChallenge(): Promise<string> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value ?? "";
  jar.delete(CHALLENGE_COOKIE);
  const row = db.prepare("DELETE FROM challenges WHERE id = ? AND expires_at > ? RETURNING challenge").get(id, Date.now()) as
    | { challenge: string }
    | undefined;
  if (!row) throw new Error("Challenge expired, try again.");
  return row.challenge;
}

export const isSetUp = () => !!db.prepare("SELECT 1 FROM users LIMIT 1").get();
export const hasPasskey = () => !!db.prepare("SELECT 1 FROM credentials LIMIT 1").get();

const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

const field = (form: FormData, key: string) => String(form.get(key) ?? "");
const MIN_PASSWORD = 10;

/** Validated new password (fields `password` and `confirm`). */
export function newPassword(form: FormData): string {
  const password = field(form, "password");
  if (password.length < MIN_PASSWORD) throw new Error("err.passwordShort"); // message says 10: keep in sync with MIN_PASSWORD
  if (password.length > 200) throw new Error("err.passwordLong");
  if (password !== field(form, "confirm")) throw new Error("err.passwordMismatch");
  return password;
}

/** Validated, unused username: 1–40 chars, unique ignoring case. */
export function newUsername(form: FormData): string {
  const username = field(form, "username").trim();
  if (!username || username.length > 40) throw new Error("err.username");
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) throw new Error("err.usernameTaken");
  return username;
}

// scrypt (built into Node): slow on purpose, salted, so a stolen DB cannot reveal the password.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  const [, salt, hash] = (stored ?? "scrypt:00:00").split(":");
  return safeEqual(scryptSync(password, Buffer.from(salt, "hex"), 64), Buffer.from(hash, "hex"));
}

// Brute-force guard: 5 failures per IP lock it for 15 minutes.
// shortcut: in-memory, resets on restart and is per-process; fine for a single-container app.
const failures = new Map<string, { n: number; until: number }>();
const MAX_FAILURES = 5;

async function clientIp() {
  const h = await headers();
  // Behind a reverse proxy the socket IP is the proxy's; it must set X-Forwarded-For / X-Real-IP.
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function assertNotLocked() {
  const f = failures.get(await clientIp());
  if (f && f.n >= MAX_FAILURES && f.until > Date.now()) throw new Error("err.locked");
}

export async function recordFailure() {
  const ip = await clientIp();
  const f = failures.get(ip);
  const n = f && f.until > Date.now() ? f.n + 1 : 1;
  failures.set(ip, { n, until: Date.now() + 15 * 60e3 });
}

export async function clearFailures() {
  failures.delete(await clientIp());
}
