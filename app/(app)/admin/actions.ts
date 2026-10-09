"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  assertNotLocked, destroyAllSessions, destroySession, hashPassword, newPassword, newUsername, recordFailure, requireAdmin, verifyPassword,
} from "@/lib/auth";
import { wipeBudget } from "@/lib/budget";
import { db, issueSetupCode, tx } from "@/lib/db";

type State = { error?: string; ok?: string };

// Every action re-checks the admin role: server actions are public endpoints.

/** Target user id from the form. Admins cannot act on themselves here, so at least one admin always remains. */
function target(form: FormData, adminId: number, allowSelf = false): number {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) throw new Error("Utilisateur inconnu");
  if (!allowSelf && id === adminId) throw new Error("Action impossible sur votre propre compte");
  return id;
}

async function attempt(fn: () => string): Promise<State> {
  try {
    const ok = fn();
    revalidatePath("/admin");
    return { ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

/** Re-asks the admin's password before destructive actions, with the login's brute-force guard. */
async function confirmPassword(adminId: number, form: FormData) {
  await assertNotLocked();
  const { password_hash } = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(adminId) as { password_hash: string };
  if (!verifyPassword(String(form.get("admin_password") ?? ""), password_hash)) {
    await recordFailure();
    throw new Error("Votre mot de passe est incorrect.");
  }
}

export async function createUser(_: State, form: FormData): Promise<State> {
  await requireAdmin();
  return attempt(() => {
    const username = newUsername(form);
    const role = form.get("role") === "admin" ? "admin" : "user";
    db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(username, hashPassword(newPassword(form)), role);
    return `${username} peut maintenant se connecter.`;
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
  return attempt(() => {
    const id = target(form, admin.id);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword(form)), id);
    destroyAllSessions(id);
    return "Mot de passe changé. L'utilisateur a été déconnecté partout.";
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

/** Factory reset: every user and all data go, a new setup code is printed in the logs. */
export async function resetApp(_: State, form: FormData): Promise<State> {
  const admin = await requireAdmin();
  try {
    if (String(form.get("confirm_text") ?? "").trim().toUpperCase() !== "RÉINITIALISER") throw new Error("Tapez RÉINITIALISER pour confirmer.");
    await confirmPassword(admin.id, form);
    await destroySession();
    tx(() => {
      db.exec("DELETE FROM users; DELETE FROM challenges; DELETE FROM sessions; DELETE FROM settings;");
      issueSetupCode();
    });
    // Leave no trace of the old data in the WAL or in free pages.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Réinitialisation impossible." };
  }
  redirect("/login");
}
