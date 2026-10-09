"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  assertNotLocked, destroyAllSessions, destroySession, hashPassword, newPassword, newUsername, recordFailure, requireAdmin, verifyPassword,
} from "@/lib/auth";
import { wipeBudget } from "@/lib/budget";
import { db, getSetting, openSetupWindow, setSetting, tx } from "@/lib/db";
import { getT } from "@/lib/locale";
import { isEmail, throttle } from "@/lib/mail";
import { sendTestEmail } from "@/lib/reports";
import { seal } from "@/lib/secret";

type State = { error?: string; ok?: string };

// Every action re-checks the admin role: server actions are public endpoints.

/** Target user id from the form. Admins cannot act on themselves here, so at least one admin always remains. */
function target(form: FormData, adminId: number, allowSelf = false): number {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) throw new Error("err.unknownUser");
  if (!allowSelf && id === adminId) throw new Error("err.self");
  return id;
}

async function attempt(fn: (t: Awaited<ReturnType<typeof getT>>["t"]) => string): Promise<State> {
  const { t, te } = await getT();
  try {
    const ok = fn(t);
    revalidatePath("/admin");
    return { ok };
  } catch (e) {
    return { error: te(e) };
  }
}

/** Re-asks the admin's password before destructive actions, with the login's brute-force guard. */
async function confirmPassword(adminId: number, form: FormData) {
  await assertNotLocked();
  const { password_hash } = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(adminId) as { password_hash: string };
  if (!verifyPassword(String(form.get("admin_password") ?? ""), password_hash)) {
    await recordFailure();
    throw new Error("err.adminPassword");
  }
}

export async function createUser(_: State, form: FormData): Promise<State> {
  await requireAdmin();
  return attempt((t) => {
    const username = newUsername(form);
    const role = form.get("role") === "admin" ? "admin" : "user";
    db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(username, hashPassword(newPassword(form)), role);
    return t("ok.userCreated", { name: username });
  });
}

export async function setRole(form: FormData) {
  const admin = await requireAdmin();
  const role = form.get("role") === "admin" ? "admin" : "user";
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, target(form, admin.id));
  revalidatePath("/admin");
}

export async function resetPassword(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  return attempt((t) => {
    const id = target(form, admin.id);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword(form)), id);
    destroyAllSessions(id);
    return t("ok.passwordReset");
  });
}

export async function revokeSessions(form: FormData) {
  const admin = await requireAdmin();
  destroyAllSessions(target(form, admin.id));
  revalidatePath("/admin");
}

/** Erases a user's banking data only: the login, passkeys and settings stay. */
export async function wipeUser(form: FormData) {
  const admin = await requireAdmin();
  wipeBudget(target(form, admin.id, true));
  revalidatePath("/", "layout");
}

export async function deleteUser(form: FormData) {
  const admin = await requireAdmin();
  db.prepare("DELETE FROM users WHERE id = ?").run(target(form, admin.id)); // cascades to accounts, passkeys, sessions
  revalidatePath("/admin");
}

/** Factory reset: every user and all data go, and the first-account screen opens again for a while. */
export async function resetApp(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const { te } = await getT();
  try {
    // The word is shown in the admin's language; either one is accepted.
    if (!["RÉINITIALISER", "RESET"].includes(String(form.get("confirm_text") ?? "").trim().toUpperCase())) throw new Error("err.resetWord");
    await confirmPassword(admin.id, form);
    await destroySession();
    tx(() => {
      db.exec("DELETE FROM users; DELETE FROM challenges; DELETE FROM sessions; DELETE FROM settings;");
    });
    // Leave no trace of the old data in the WAL or in free pages.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
    openSetupWindow(db, true);
  } catch (e) {
    return { error: te(e) };
  }
  redirect("/login");
}

const SMTP_KEYS = ["host", "port", "security", "user", "pass", "from", "from_name"];

/** Outgoing e-mail server. An empty server turns e-mail off; an empty password keeps the saved one. */
export async function saveSmtp(_: State, form: FormData): Promise<State> {
  await requireAdmin();
  return attempt((t) => {
    const f = (k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
    const host = f("host");
    if (!host) {
      for (const k of SMTP_KEYS) db.prepare("DELETE FROM settings WHERE key = ?").run(`smtp_${k}`);
      return t("ok.smtpOff");
    }
    const port = Number(f("port"));
    const security = f("security");
    const from = f("from");
    if (!/^[a-z0-9.-]+$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("err.smtpServer");
    if (!["starttls", "tls", "none"].includes(security)) throw new Error("Invalid security");
    if (!isEmail(from)) throw new Error("err.smtpFrom");
    tx(() => {
      for (const [k, v] of [["host", host], ["port", String(port)], ["security", security], ["user", f("user")], ["from", from], ["from_name", f("from_name", 80)]]) {
        setSetting(`smtp_${k}`, v);
      }
      const pass = String(form.get("pass") ?? "");
      if (pass) setSetting("smtp_pass", seal(pass));
      else if (!f("user") || form.get("clear_pass")) db.prepare("DELETE FROM settings WHERE key = 'smtp_pass'").run();
    });
    return t("ok.smtpSaved");
  });
}

/** Sends a sample statement with the saved settings, to check the server and the PDF in one go. */
export async function testSmtp(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  const { t, te, locale } = await getT();
  try {
    const to = String(form.get("to") ?? "").trim();
    if (!isEmail(to)) throw new Error("err.email");
    if (!getSetting("smtp_host")) throw new Error("err.mailOff");
    throttle(`user-${admin.id}`);
    await sendTestEmail(to, admin, locale);
    return { ok: t("ok.testSent", { email: to }) };
  } catch (e) {
    return { error: te(e) };
  }
}
