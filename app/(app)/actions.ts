"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser, verifyPassword, assertNotLocked, recordFailure } from "@/lib/auth";
import { OWN, PEA_DEPOSITS, assertOwnAccounts, transferTwin, wipeBudget, type Transaction } from "@/lib/budget";
import { db, tx } from "@/lib/db";
import { CURRENCIES, EVERY, REMIND, SCHEMA, isLogo, parseBackup } from "@/lib/backup";
import { dayInMonth, localToday, parseCents, addMonths, ym } from "@/lib/forecast";
import { isLocale } from "@/lib/i18n";
import { LOCALE_COOKIE, getT } from "@/lib/locale";
import { isEmail, throttle } from "@/lib/mail";
import { sendTestEmail } from "@/lib/reports";
import { PUSH_SERVICE, sendPush } from "@/lib/push";
import { calendarUrl, checkCalendar, clearCalendar, syncCalendar } from "@/lib/caldav";
import { seal, unseal } from "@/lib/secret";
import { createToken } from "@/lib/mcp";

// Every action re-checks the session: server actions are public endpoints.
// Invalid input throws: the forms' HTML validation already blocks honest mistakes, so these messages
// (in English) only reach logs. Messages shown to the user are dictionary keys, translated with te().

function text(form: FormData, key: string, max = 80): string {
  const v = String(form.get(key) ?? "").trim();
  if (!v || v.length > max) throw new Error(`Invalid field: ${key}`);
  return v;
}
const optText = (form: FormData, key: string) => String(form.get(key) ?? "").trim().slice(0, 40) || null;
const id = (form: FormData, key = "id") => {
  const n = Number(form.get(key));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid field: ${key}`);
  return n;
};
function cents(form: FormData, key: string, allowNegative = false): number {
  const n = parseCents(String(form.get(key) ?? ""));
  if (n === null || (!allowNegative && n < 0)) throw new Error(`Invalid amount: ${key}`);
  return n;
}
function date(form: FormData, key = "date"): string {
  const v = String(form.get(key) ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Invalid date");
  return v;
}

/** Shared fields of operations, subscriptions and planned expenses. Expenses and transfers are stored negative. */
function entry(uid: number, form: FormData) {
  const type = String(form.get("type"));
  const amount = cents(form, "amount");
  const account_id = id(form, "account_id");
  const to_account_id = type === "virement" ? id(form, "to_account_id") : null;
  if (to_account_id === account_id) throw new Error("Transfer to the same account");
  assertOwnAccounts(uid, account_id, to_account_id);
  return {
    label: text(form, "label"),
    amount: type === "revenu" ? amount : -amount,
    account_id,
    to_account_id,
    category: type === "virement" ? "Virement" : optText(form, "category"),
  };
}

/** Refreshes the pages. With a user id, also updates their calendar once the response is sent (subscriptions changed). */
async function done(calendarOf?: number) {
  if (calendarOf) after(() => syncCalendar(calendarOf));
  revalidatePath("/", "layout");
}

function insertTransaction(e: ReturnType<typeof entry>, d: string) {
  const insert = db.prepare("INSERT INTO transactions (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)");
  insert.run(e.account_id, e.label, e.amount, d, e.category);
  if (e.to_account_id) insert.run(e.to_account_id, e.label, -e.amount, d, e.category);
}

export async function addTransaction(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  const d = date(form);
  tx(() => insertTransaction(e, d));
  await done();
}

/** Any field can change, even the type: the operation (both sides of a transfer) is replaced. */
export async function updateTransaction(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  const d = date(form);
  const old = db.prepare(`SELECT * FROM transactions WHERE id = ? AND ${OWN}`).get(id(form), uid) as Transaction | undefined;
  if (!old) throw new Error("Unknown operation");
  const del = db.prepare("DELETE FROM transactions WHERE id = ?");
  tx(() => {
    const twin = transferTwin(uid, old);
    del.run(old.id);
    if (twin) del.run(twin.id);
    insertTransaction(e, d);
  });
  await done();
}

/** Day, frequency, next due month (this month when monthly) and reminder days of a subscription. */
function schedule(form: FormData) {
  const day = id(form, "day");
  if (day > 31) throw new Error("Invalid day");
  const every = Number(form.get("every") ?? 1);
  if (!EVERY.includes(every as never)) throw new Error("Invalid frequency");
  const today = localToday();
  const next = every === 1 ? ym(today) : String(form.get("next"));
  if (!/^\d{4}-\d{2}$/.test(next)) throw new Error("Invalid month");
  // Already past: assume it is paid and reflected in the current balance.
  const lastPosted = dayInMonth(next, day) <= today ? next : addMonths(next, -every);
  // "7, 1" → "7,1": distinct, largest first.
  const days = [...new Set(String(form.get("remind") ?? "").split(/[\s,;]+/).filter(Boolean).map(Number))].sort((a, b) => b - a).join(",");
  if (days && !REMIND.test(days)) throw new Error("Invalid reminders");
  const logo = String(form.get("logo") ?? "");
  if (logo && !isLogo(logo)) throw new Error("Invalid logo");
  return { day, every, lastPosted, remind: days || null, logo: logo || null };
}

export async function addRecurring(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  const s = schedule(form);
  db.prepare("INSERT INTO recurring (account_id, to_account_id, label, amount, day, category, last_posted, every, remind, logo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(e.account_id, e.to_account_id, e.label, e.amount, s.day, e.category, s.lastPosted, s.every, s.remind, s.logo);
  await done(uid);
}

export async function addPlanned(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  db.prepare("INSERT INTO planned (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)")
    .run(e.account_id, e.label, e.amount, date(form), e.category);
  await done();
}

// Already posted operations stay as they are; the new values apply from the next posting.
// Monthly: never move last_posted back, or a month already posted would post again.
export async function updateRecurring(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  const s = schedule(form);
  db.prepare(`
    UPDATE recurring SET account_id = ?, to_account_id = ?, label = ?, amount = ?, day = ?, category = ?, every = ?, remind = ?, logo = ?,
      last_posted = ${s.every === 1 ? "max(last_posted, ?)" : "?"}
    WHERE id = ? AND ${OWN}
  `).run(e.account_id, e.to_account_id, e.label, e.amount, s.day, e.category, s.every, s.remind, s.logo, s.lastPosted, id(form), uid);
  await done(uid);
}

export async function updatePlanned(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  db.prepare(`UPDATE planned SET account_id = ?, label = ?, amount = ?, date = ?, category = ? WHERE id = ? AND ${OWN}`)
    .run(e.account_id, e.label, e.amount, date(form), e.category, id(form), uid);
  await done();
}

/** A planned expense happened: it becomes a real transaction dated today. */
export async function payPlanned(form: FormData) {
  const { id: uid } = await requireUser();
  const pid = id(form);
  tx(() => {
    db.prepare(`INSERT INTO transactions (account_id, label, amount, date, category) SELECT account_id, label, amount, ?, category FROM planned WHERE id = ? AND ${OWN}`)
      .run(localToday(), pid, uid);
    db.prepare(`DELETE FROM planned WHERE id = ? AND ${OWN}`).run(pid, uid);
  });
  await done();
}

const deletable = { transactions: 1, recurring: 1, planned: 1, accounts: 1 } as const;

export async function deleteRow(form: FormData) {
  const { id: uid } = await requireUser();
  const table = String(form.get("table"));
  if (!(table in deletable)) throw new Error("Invalid table"); // whitelist: the name is interpolated below
  db.prepare(`DELETE FROM ${table} WHERE id = ? AND ${table === "accounts" ? "user_id = ?" : OWN}`).run(id(form), uid);
  await done(uid);
}

/** Account types of the form: products are kept apart from kind, which says whether the money is for spending. */
const ACCOUNT_TYPES: Record<string, { kind: "courant" | "epargne"; product: string | null }> = {
  courant: { kind: "courant", product: null },
  resto: { kind: "courant", product: "resto" },
  cash: { kind: "courant", product: "cash" },
  cash_reserve: { kind: "epargne", product: "cash_reserve" }, // set aside, not for spending: its minimum is the rule that matters
  livret_a: { kind: "epargne", product: "livret_a" },
  livret_jeune: { kind: "epargne", product: "livret_jeune" },
  pea: { kind: "epargne", product: "pea" },
  epargne: { kind: "epargne", product: null },
};

export async function saveAccount(form: FormData) {
  const { id: uid } = await requireUser();
  const typeName = String(form.get("type"));
  if (!Object.hasOwn(ACCOUNT_TYPES, typeName)) throw new Error("Invalid account type");
  const type = ACCOUNT_TYPES[typeName];
  const optCents = (key: string) => (String(form.get(key) ?? "").trim() ? cents(form, key, true) : null);
  const min = optCents("min_balance");
  // Empty: the product's legal ceiling. Spending accounts have none.
  const ceiling = type.kind === "epargne" ? optCents("ceiling") : null;
  if (ceiling !== null && ceiling <= 0) throw new Error("Invalid ceiling");
  // The user types the real current balance (to match the bank); store it as an offset from the transactions.
  const aid = form.get("id") ? id(form) : null;
  if (aid) assertOwnAccounts(uid, aid);
  const { s } = db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE account_id = ?").get(aid) as { s: number };
  // Same for the deposits of a PEA, offset from the transfers in.
  const deposits = type.product === "pea" ? optCents("deposits") : null;
  const { d } = db.prepare(`SELECT ${PEA_DEPOSITS} AS d FROM (SELECT ? AS id) a`).get(aid) as { d: number };
  const values = [
    text(form, "name", 40), type.kind, type.product, optText(form, "bank"), cents(form, "balance", true) - s, min, ceiling,
    deposits === null ? null : deposits - d,
  ] as const;
  const cols = "name = ?, kind = ?, product = ?, bank = ?, initial_balance = ?, min_balance = ?, ceiling = ?, deposits_base = ?";
  if (aid) db.prepare(`UPDATE accounts SET ${cols} WHERE id = ?`).run(...values, aid);
  else db.prepare("INSERT INTO accounts (name, kind, product, bank, initial_balance, min_balance, ceiling, deposits_base, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(...values, uid);
  await done(uid);
}

/** Interface language and display currency. The language also goes in a cookie so the login page keeps it. */
export async function savePreferences(form: FormData) {
  const { id: uid } = await requireUser();
  const c = String(form.get("currency"));
  const locale = form.get("locale");
  if (!CURRENCIES.includes(c as never)) throw new Error("Unknown currency");
  if (!isLocale(locale)) throw new Error("Unknown language");
  db.prepare("UPDATE users SET currency = ?, locale = ? WHERE id = ?").run(c, locale, uid);
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: 365 * 86400, path: "/", sameSite: "lax" });
  await done(uid);
}

/**
 * Restores a JSON backup, replacing the user's budget data. Returns form state for useActionState.
 * Rows get new ids (other users own the backup's ids); references are remapped to the new accounts.
 */
export async function importData(_: { error?: string; ok?: string }, form: FormData) {
  const { id: uid } = await requireUser();
  const { t, te } = await getT();
  try {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("err.noFile");
    const backup = parseBackup(await file.text());
    tx(() => {
      // Not wipeBudget: statements are snapshots of the past and stay.
      db.prepare("DELETE FROM accounts WHERE user_id = ?").run(uid); // cascades to transactions, recurring and planned
      const accountIds = new Map<unknown, number>();
      const ref = (v: unknown) => {
        if (v === null || v === undefined) return null;
        const n = accountIds.get(v);
        if (n === undefined) throw new Error("err.backupRefs");
        return n;
      };
      for (const table of ["accounts", "transactions", "recurring", "planned"] as const) {
        const cols = Object.keys(SCHEMA[table]).filter((c) => c !== "id");
        const insert = db.prepare(
          `INSERT INTO ${table} (${[...cols, ...(table === "accounts" ? ["user_id"] : [])].join(", ")}) VALUES (${cols.map(() => "?").join(", ")}${table === "accounts" ? ", ?" : ""})`,
        );
        for (const row of backup[table]) {
          const values = cols.map((c) => (c === "account_id" || c === "to_account_id" ? ref(row[c]) : ((row[c] ?? (c === "every" ? 1 : null)) as number | string | null)));
          const { lastInsertRowid } = insert.run(...values, ...(table === "accounts" ? [uid] : []));
          if (table === "accounts") accountIds.set(row.id, Number(lastInsertRowid));
        }
      }
      db.prepare("UPDATE users SET currency = ? WHERE id = ?").run(backup.currency, uid);
    });
    await done(uid);
    return { ok: t("ok.imported", { accounts: backup.accounts.length, operations: backup.transactions.length }) };
  } catch (e) {
    // The transaction rolled back: the previous data is intact.
    return { error: te(e) };
  }
}

/** The user erases their own banking data. The password guards against a stolen unlocked session or a misclick. */
export async function wipeMyData(_: { error?: string; ok?: string }, form: FormData) {
  const { id: uid } = await requireUser();
  const { t, te } = await getT();
  try {
    await assertNotLocked();
    const { password_hash } = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(uid) as { password_hash: string };
    if (!verifyPassword(String(form.get("password") ?? ""), password_hash)) {
      await recordFailure();
      throw new Error("err.password");
    }
    wipeBudget(uid);
    await done(uid);
    return { ok: t("ok.wiped") };
  } catch (e) {
    return { error: te(e) };
  }
}

/** The user's own address: where their statements and test e-mails go. Empty removes it. */
export async function saveEmail(_: { error?: string; ok?: string }, form: FormData) {
  const { id } = await requireUser();
  const { t, te } = await getT();
  try {
    const email = String(form.get("email") ?? "").trim();
    if (email && !isEmail(email)) throw new Error("err.email");
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email || null, id);
    await done();
    return { ok: t(email ? "ok.emailSaved" : "ok.emailRemoved") };
  } catch (e) {
    return { error: te(e) };
  }
}

/** Sends a sample statement to the user's address: checks the server's e-mail settings and PDF generation. */
export async function sendMyTestEmail() {
  const user = await requireUser();
  const { t, te, locale } = await getT();
  try {
    const { email } = db.prepare("SELECT email FROM users WHERE id = ?").get(user.id) as { email: string | null };
    if (!email) throw new Error("err.noEmail");
    throttle(`user-${user.id}`);
    await sendTestEmail(email, user, locale);
    return { ok: t("ok.testSent", { email }) };
  } catch (e) {
    return { error: te(e) };
  }
}

/** Registers this device for push notifications: the browser's PushSubscription, as JSON. */
export async function savePushSubscription(sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) {
  const { id: uid } = await requireUser();
  const key = (v: unknown) => typeof v === "string" && v.length <= 200 && /^[\w-]+=*$/.test(v);
  const { endpoint, keys } = sub ?? {};
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !PUSH_SERVICE.test(endpoint)) throw new Error("Invalid push endpoint");
  if (!key(keys?.p256dh) || !key(keys?.auth)) throw new Error("Invalid push keys");
  // A browser shared by two users notifies the last one who turned it on.
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(endpoint, uid, keys!.p256dh as string, keys!.auth as string);
}

export async function deletePushSubscription(endpoint: string) {
  const { id: uid } = await requireUser();
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(String(endpoint), uid);
}

/** Test notification to every device of the user. */
export async function sendTestPush(): Promise<{ error?: string; ok?: string }> {
  const { id: uid } = await requireUser();
  const { t, te } = await getT();
  try {
    throttle(`push-${uid}`);
    if (!(await sendPush(uid, { title: "Economy", body: t("push.test"), url: "/reglages" }))) throw new Error("err.push");
    return { ok: t("ok.pushSent") };
  } catch (e) {
    return { error: te(e) };
  }
}

/**
 * Connects the user's CalDAV calendar (Nextcloud): checked with the given credentials before it is saved, then filled.
 * An empty password keeps the saved one. Another calendar first gets its events removed from the old one.
 */
export async function saveCalendar(_: { error?: string; ok?: string }, form: FormData) {
  const { id: uid } = await requireUser();
  const { t, te } = await getT();
  try {
    throttle(`caldav-${uid}`); // each try makes the server send requests
    const url = calendarUrl(String(form.get("url") ?? ""));
    const user = text(form, "user", 100);
    const typed = String(form.get("pass") ?? "");
    const old = db.prepare("SELECT caldav_url, caldav_pass FROM users WHERE id = ?").get(uid) as { caldav_url: string | null; caldav_pass: string | null };
    const pass = typed || (old.caldav_pass && unseal(old.caldav_pass));
    if (!pass || pass.length > 200) throw new Error("err.caldavAuth");
    await checkCalendar({ url, user, pass });
    if (old.caldav_url && old.caldav_url !== url) await clearCalendar(uid);
    db.prepare("UPDATE users SET caldav_url = ?, caldav_user = ?, caldav_pass = ?, caldav_error = NULL WHERE id = ?").run(url, user, seal(pass), uid);
    const error = await syncCalendar(uid);
    if (error) throw new Error(error);
    await done();
    return { ok: t("ok.caldavSaved") };
  } catch (e) {
    await done();
    return { error: te(e) };
  }
}

export async function syncCalendarNow() {
  const { id: uid } = await requireUser();
  const { t, te } = await getT();
  try {
    if (!(db.prepare("SELECT caldav_url FROM users WHERE id = ?").get(uid) as { caldav_url: string | null }).caldav_url) throw new Error("err.caldavOff");
    throttle(`caldav-${uid}`);
    const error = await syncCalendar(uid);
    if (error) throw new Error(error);
    return { ok: t("ok.caldavSynced") };
  } catch (e) {
    return { error: te(e) };
  } finally {
    await done();
  }
}

/** Removes this app's events from the calendar, then forgets the connection and its password. */
export async function disconnectCalendar() {
  const { id: uid } = await requireUser();
  await clearCalendar(uid);
  db.prepare("UPDATE users SET caldav_url = NULL, caldav_user = NULL, caldav_pass = NULL, caldav_synced_at = NULL, caldav_error = NULL WHERE id = ?").run(uid);
  await done();
}

/** New MCP access token. Shown once in the answer: only its hash is kept. */
export async function createApiToken(_: { error?: string; ok?: string }, form: FormData) {
  const { id: uid } = await requireUser();
  const { t, te } = await getT();
  try {
    const scope = form.get("scope") === "write" ? "write" : "read";
    const n = (db.prepare("SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?").get(uid) as { n: number }).n;
    if (n >= 20) throw new Error("err.tokenLimit");
    const token = createToken(uid, text(form, "name", 40), scope);
    revalidatePath("/reglages");
    return { ok: t("set.mcpCreated", { token }) };
  } catch (e) {
    return { error: te(e) };
  }
}

/** Free text served to AI assistants by the MCP server (goals, habits, rules of thumb). */
export async function saveMcpContext(_: { error?: string; ok?: string }, form: FormData) {
  const { id: uid } = await requireUser();
  const { t } = await getT();
  db.prepare("UPDATE users SET mcp_context = ? WHERE id = ?").run(String(form.get("context") ?? "").trim().slice(0, 2000) || null, uid);
  revalidatePath("/reglages");
  return { ok: t("ok.mcpContext") };
}

export async function deleteApiToken(form: FormData) {
  const { id: uid } = await requireUser();
  db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run(id(form), uid);
  revalidatePath("/reglages");
}
