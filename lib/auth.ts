import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, getSetting, sha256 } from "./db";

export const ORIGIN = (process.env.ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
export const RP_ID = new URL(ORIGIN).hostname;
const SECURE = ORIGIN.startsWith("https://");
const SESSION_COOKIE = "session";
const CHALLENGE_COOKIE = "webauthn";
const SESSION_DAYS = 30;

const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: SECURE, sameSite: "lax" as const, path: "/", maxAge });

export async function isLoggedIn(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  // Only the hash is stored, so a leaked DB file does not leak live sessions.
  return !!db.prepare("SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?").get(sha256(token), Date.now());
}

/** Call at the top of every page, route and server action that touches budget data. */
export async function requireUser() {
  if (!(await isLoggedIn())) redirect("/login");
}

export async function createSession() {
  const token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)").run(sha256(token), Date.now() + SESSION_DAYS * 864e5);
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(SESSION_DAYS * 86400));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  jar.delete(SESSION_COOKIE);
}

/** Logs out every device (after a password change). */
export function destroyAllSessions() {
  db.prepare("DELETE FROM sessions").run();
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
  if (!row) throw new Error("Défi expiré, réessayez.");
  return row.challenge;
}

export const isSetUp = () => getSetting("password_hash") !== null;
export const hasPasskey = () => !!db.prepare("SELECT 1 FROM credentials LIMIT 1").get();

const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function checkSetupCode(code: string): boolean {
  const hash = getSetting("setup_code_hash");
  return !!hash && safeEqual(Buffer.from(sha256(code.trim().toLowerCase())), Buffer.from(hash));
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
  if (f && f.n >= MAX_FAILURES && f.until > Date.now()) throw new Error("Trop de tentatives, réessayez dans 15 minutes.");
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
