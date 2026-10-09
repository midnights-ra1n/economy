"use server";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, setupMinutesLeft, tx } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { LOCALE_COOKIE, getT } from "@/lib/locale";
import { cookies } from "next/headers";
import {
  ORIGIN, RP_ID, assertNotLocked, clearFailures, createSession, destroyAllSessions, destroySession,
  hashPassword, isSetUp, newPassword, newUsername, recordFailure, requireUser, saveChallenge, takeChallenge, verifyPassword,
} from "@/lib/auth";

export type FormState = { error?: string; ok?: string };
type Cred = { id: string; public_key: Uint8Array; counter: number; transports: string | null; user_id: number };

const field = (form: FormData, key: string) => String(form.get(key) ?? "");
/** Turns thrown messages into form state: server action errors are hidden from the client in production. */
async function attempt(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    return { error: (await getT()).te(e) };
  }
}

/** First run: only possible in the minutes after the server starts (see setupMinutesLeft). */
export async function setup(_: FormState, form: FormData): Promise<FormState> {
  const state = await attempt(async () => {
    if (!setupMinutesLeft()) throw new Error("err.setupClosed");
    const username = newUsername(form);
    const password = hashPassword(newPassword(form));
    // Inside the write lock: two simultaneous submissions cannot both become the first admin.
    const uid = tx(() => {
      if (isSetUp()) throw new Error("err.exists");
      return Number(db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')").run(username, password).lastInsertRowid);
    });
    await createSession(uid);
  });
  if (state.error) return state;
  redirect("/");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const state = await attempt(async () => {
    await assertNotLocked();
    const user = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(field(form, "username").trim()) as
      | { id: number; password_hash: string }
      | undefined;
    // scrypt runs even for an unknown user so timing does not reveal which usernames exist.
    const passOk = verifyPassword(field(form, "password"), user?.password_hash ?? null);
    if (!user || !passOk) {
      await recordFailure();
      throw new Error("err.credentials");
    }
    await clearFailures();
    await createSession(user.id);
  });
  if (state.error) return state;
  redirect("/");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  return attempt(async () => {
    await assertNotLocked();
    const { password_hash } = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
    if (!verifyPassword(field(form, "current"), password_hash)) {
      await recordFailure();
      throw new Error("err.currentPassword");
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword(form)), user.id);
    destroyAllSessions(user.id); // other devices must log in again with the new password
    await createSession(user.id);
    return { ok: (await getT()).t("ok.passwordChanged") };
  });
}

export async function registrationOptions() {
  const user = await requireUser();
  const existing = db.prepare("SELECT id, transports FROM credentials WHERE user_id = ?").all(user.id) as Pick<Cred, "id" | "transports">[];
  const options = await generateRegistrationOptions({
    rpName: "Economy",
    rpID: RP_ID,
    userName: user.username,
    userID: new TextEncoder().encode(`user-${user.id}`), // stable per user so a device keeps one passkey per account
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge(options.challenge);
  return options;
}

export async function verifyRegistration(response: RegistrationResponseJSON, name: string) {
  const user = await requireUser();
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: await takeChallenge(),
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
  if (!verified) throw new Error("Passkey rejected.");
  const { credential } = registrationInfo;
  db.prepare("INSERT INTO credentials (id, public_key, counter, transports, name, user_id) VALUES (?, ?, ?, ?, ?, ?)").run(
    credential.id,
    credential.publicKey,
    credential.counter,
    JSON.stringify(credential.transports ?? []),
    name.trim().slice(0, 50) || "Passkey",
    user.id,
  );
  revalidatePath("/reglages");
}

export async function authenticationOptions() {
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred" });
  await saveChallenge(options.challenge);
  return options;
}

export async function verifyAuthentication(response: AuthenticationResponseJSON) {
  const expectedChallenge = await takeChallenge();
  const cred = db.prepare("SELECT * FROM credentials WHERE id = ?").get(response.id) as Cred | undefined;
  if (!cred) throw new Error("Unknown passkey.");
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: { id: cred.id, publicKey: new Uint8Array(cred.public_key), counter: cred.counter },
  });
  if (!verified) throw new Error("Passkey rejected.");
  db.prepare("UPDATE credentials SET counter = ? WHERE id = ?").run(authenticationInfo.newCounter, cred.id);
  await createSession(cred.user_id);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function deletePasskey(formData: FormData) {
  const user = await requireUser();
  db.prepare("DELETE FROM credentials WHERE id = ? AND user_id = ?").run(String(formData.get("id")), user.id);
  revalidatePath("/reglages");
}

/** Language switch of the login page (no account yet): only a cookie. */
export async function setLocaleCookie(form: FormData) {
  const locale = form.get("locale");
  if (isLocale(locale)) (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: 365 * 86400, path: "/", sameSite: "lax" });
  revalidatePath("/login");
}
