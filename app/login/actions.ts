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
import { db, getSetting, setSetting } from "@/lib/db";
import {
  ORIGIN, RP_ID, assertNotLocked, checkSetupCode, clearFailures, createSession, destroyAllSessions, destroySession,
  hashPassword, isSetUp, recordFailure, requireUser, saveChallenge, takeChallenge, verifyPassword,
} from "@/lib/auth";

export type FormState = { error?: string; ok?: string };
type Cred = { id: string; public_key: Uint8Array; counter: number; transports: string | null };

const field = (form: FormData, key: string) => String(form.get(key) ?? "");
const MIN_PASSWORD = 10;

function newPassword(form: FormData): string {
  const password = field(form, "password");
  if (password.length < MIN_PASSWORD) throw new Error(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`);
  if (password.length > 200) throw new Error("Mot de passe trop long.");
  if (password !== field(form, "confirm")) throw new Error("Les deux mots de passe ne correspondent pas.");
  return password;
}

/** Turns thrown messages into form state: server action errors are hidden from the client in production. */
async function attempt(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

/** First run: the setup code from the container logs proves the caller owns the server. */
export async function setup(_: FormState, form: FormData): Promise<FormState> {
  const state = await attempt(async () => {
    if (isSetUp()) throw new Error("Le compte existe déjà.");
    await assertNotLocked();
    if (!checkSetupCode(field(form, "code"))) {
      await recordFailure();
      throw new Error("Code d'initialisation incorrect. Il est affiché dans les logs du conteneur.");
    }
    const username = field(form, "username").trim();
    if (!username || username.length > 40) throw new Error("Identifiant invalide.");
    const password = newPassword(form);
    setSetting("username", username);
    setSetting("password_hash", hashPassword(password));
    db.prepare("DELETE FROM settings WHERE key = 'setup_code_hash'").run();
    await clearFailures();
    await createSession();
  });
  if (state.error) return state;
  redirect("/");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const state = await attempt(async () => {
    await assertNotLocked();
    // Both checks always run so timing does not reveal which one failed.
    const userOk = field(form, "username").trim() === getSetting("username");
    const passOk = verifyPassword(field(form, "password"), getSetting("password_hash"));
    if (!userOk || !passOk) {
      await recordFailure();
      throw new Error("Identifiant ou mot de passe incorrect.");
    }
    await clearFailures();
    await createSession();
  });
  if (state.error) return state;
  redirect("/");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  return attempt(async () => {
    await assertNotLocked();
    if (!verifyPassword(field(form, "current"), getSetting("password_hash"))) {
      await recordFailure();
      throw new Error("Mot de passe actuel incorrect.");
    }
    setSetting("password_hash", hashPassword(newPassword(form)));
    destroyAllSessions(); // other devices must log in again with the new password
    await createSession();
    return { ok: "Mot de passe modifié. Les autres appareils sont déconnectés." };
  });
}

export async function registrationOptions() {
  await requireUser();
  const existing = db.prepare("SELECT id, transports FROM credentials").all() as Pick<Cred, "id" | "transports">[];
  const options = await generateRegistrationOptions({
    rpName: "Economy",
    rpID: RP_ID,
    userName: getSetting("username") ?? "moi",
    userID: new TextEncoder().encode("owner"), // single-user app: stable id so devices sync one passkey
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge(options.challenge);
  return options;
}

export async function verifyRegistration(response: RegistrationResponseJSON, name: string) {
  await requireUser();
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: await takeChallenge(),
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
  if (!verified) throw new Error("Passkey refusée.");
  const { credential } = registrationInfo;
  db.prepare("INSERT INTO credentials (id, public_key, counter, transports, name) VALUES (?, ?, ?, ?, ?)").run(
    credential.id,
    credential.publicKey,
    credential.counter,
    JSON.stringify(credential.transports ?? []),
    name.trim().slice(0, 50) || "Passkey",
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
  if (!cred) throw new Error("Passkey inconnue.");
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: { id: cred.id, publicKey: new Uint8Array(cred.public_key), counter: cred.counter },
  });
  if (!verified) throw new Error("Passkey refusée.");
  db.prepare("UPDATE credentials SET counter = ? WHERE id = ?").run(authenticationInfo.newCounter, cred.id);
  await createSession();
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function deletePasskey(formData: FormData) {
  await requireUser();
  db.prepare("DELETE FROM credentials WHERE id = ?").run(String(formData.get("id")));
  revalidatePath("/reglages");
}
