"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser, verifyPassword, assertNotLocked, recordFailure } from "@/lib/auth";
import { OWN, assertOwnAccounts, wipeBudget } from "@/lib/budget";
import { db, tx } from "@/lib/db";
import { CURRENCIES, SCHEMA, parseBackup } from "@/lib/backup";
import { dayInMonth, localToday, parseCents, addMonths, ym } from "@/lib/forecast";
import { isLocale } from "@/lib/i18n";
import { LOCALE_COOKIE, getT } from "@/lib/locale";

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

async function done() {
  revalidatePath("/", "layout");
}

export async function addTransaction(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  const d = date(form);
  const insert = db.prepare("INSERT INTO transactions (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)");
  tx(() => {
    insert.run(e.account_id, e.label, e.amount, d, e.category);
    if (e.to_account_id) insert.run(e.to_account_id, e.label, -e.amount, d, e.category);
  });
  await done();
}

export async function addRecurring(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  const day = id(form, "day");
  if (day > 31) throw new Error("Invalid day");
  const today = localToday();
  // Already past this month: assume it is paid and reflected in the current balance.
  const lastPosted = dayInMonth(ym(today), day) <= today ? ym(today) : addMonths(ym(today), -1);
  db.prepare("INSERT INTO recurring (account_id, to_account_id, label, amount, day, category, last_posted) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(e.account_id, e.to_account_id, e.label, e.amount, day, e.category, lastPosted);
  await done();
}

export async function addPlanned(form: FormData) {
  const { id: uid } = await requireUser();
  const e = entry(uid, form);
  db.prepare("INSERT INTO planned (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)")
    .run(e.account_id, e.label, e.amount, date(form), e.category);
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
  await done();
}

export async function saveAccount(form: FormData) {
  const { id: uid } = await requireUser();
  const kind = String(form.get("kind"));
  if (kind !== "courant" && kind !== "epargne") throw new Error("Invalid account type");
  const min = String(form.get("min_balance") ?? "").trim() ? cents(form, "min_balance", true) : null;
  // The user types the real current balance (to match the bank); store it as an offset from the transactions.
  const aid = form.get("id") ? id(form) : null;
  if (aid) assertOwnAccounts(uid, aid);
  const { s } = db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE account_id = ?").get(aid) as { s: number };
  const values = [text(form, "name", 40), kind, cents(form, "balance", true) - s, min] as const;
  if (aid) db.prepare("UPDATE accounts SET name = ?, kind = ?, initial_balance = ?, min_balance = ? WHERE id = ?").run(...values, aid);
  else db.prepare("INSERT INTO accounts (name, kind, initial_balance, min_balance, user_id) VALUES (?, ?, ?, ?, ?)").run(...values, uid);
  await done();
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
  await done();
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
          const values = cols.map((c) => (c === "account_id" || c === "to_account_id" ? ref(row[c]) : ((row[c] ?? null) as number | string | null)));
          const { lastInsertRowid } = insert.run(...values, ...(table === "accounts" ? [uid] : []));
          if (table === "accounts") accountIds.set(row.id, Number(lastInsertRowid));
        }
      }
      db.prepare("UPDATE users SET currency = ? WHERE id = ?").run(backup.currency, uid);
    });
    await done();
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
    await done();
    return { ok: t("ok.wiped") };
  } catch (e) {
    return { error: te(e) };
  }
}
