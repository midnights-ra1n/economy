"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db, setSetting, tx } from "@/lib/db";
import { CURRENCIES, SCHEMA, parseBackup } from "@/lib/backup";
import { dayInMonth, localToday, parseCents, addMonths, ym } from "@/lib/forecast";

// Every action re-checks the session: server actions are public endpoints.
// Invalid input throws: the forms' HTML validation already blocks honest mistakes.

function text(form: FormData, key: string, max = 80): string {
  const v = String(form.get(key) ?? "").trim();
  if (!v || v.length > max) throw new Error(`Champ invalide : ${key}`);
  return v;
}
const optText = (form: FormData, key: string) => String(form.get(key) ?? "").trim().slice(0, 40) || null;
const id = (form: FormData, key = "id") => {
  const n = Number(form.get(key));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Champ invalide : ${key}`);
  return n;
};
function cents(form: FormData, key: string, allowNegative = false): number {
  const n = parseCents(String(form.get(key) ?? ""));
  if (n === null || (!allowNegative && n < 0)) throw new Error(`Montant invalide : ${key}`);
  return n;
}
function date(form: FormData, key = "date"): string {
  const v = String(form.get(key) ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Date invalide");
  return v;
}

/** Shared fields of operations, subscriptions and planned expenses. Expenses and transfers are stored negative. */
function entry(form: FormData) {
  const type = String(form.get("type"));
  const amount = cents(form, "amount");
  const account_id = id(form, "account_id");
  const to_account_id = type === "virement" ? id(form, "to_account_id") : null;
  if (to_account_id === account_id) throw new Error("Virement vers le même compte");
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
  await requireUser();
  const e = entry(form);
  const d = date(form);
  const insert = db.prepare("INSERT INTO transactions (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)");
  tx(() => {
    insert.run(e.account_id, e.label, e.amount, d, e.category);
    if (e.to_account_id) insert.run(e.to_account_id, e.label, -e.amount, d, e.category);
  });
  await done();
}

export async function addRecurring(form: FormData) {
  await requireUser();
  const e = entry(form);
  const day = id(form, "day");
  if (day > 31) throw new Error("Jour invalide");
  const today = localToday();
  // Already past this month: assume it is paid and reflected in the current balance.
  const lastPosted = dayInMonth(ym(today), day) <= today ? ym(today) : addMonths(ym(today), -1);
  db.prepare("INSERT INTO recurring (account_id, to_account_id, label, amount, day, category, last_posted) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(e.account_id, e.to_account_id, e.label, e.amount, day, e.category, lastPosted);
  await done();
}

export async function addPlanned(form: FormData) {
  await requireUser();
  const e = entry(form);
  db.prepare("INSERT INTO planned (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)")
    .run(e.account_id, e.label, e.amount, date(form), e.category);
  await done();
}

/** A planned expense happened: it becomes a real transaction dated today. */
export async function payPlanned(form: FormData) {
  await requireUser();
  const pid = id(form);
  tx(() => {
    db.prepare("INSERT INTO transactions (account_id, label, amount, date, category) SELECT account_id, label, amount, ?, category FROM planned WHERE id = ?")
      .run(localToday(), pid);
    db.prepare("DELETE FROM planned WHERE id = ?").run(pid);
  });
  await done();
}

const deletable = { transactions: 1, recurring: 1, planned: 1, accounts: 1 } as const;

export async function deleteRow(form: FormData) {
  await requireUser();
  const table = String(form.get("table"));
  if (!(table in deletable)) throw new Error("Table invalide"); // whitelist: the name is interpolated below
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id(form));
  await done();
}

export async function saveAccount(form: FormData) {
  await requireUser();
  const kind = String(form.get("kind"));
  if (kind !== "courant" && kind !== "epargne") throw new Error("Type invalide");
  const min = String(form.get("min_balance") ?? "").trim() ? cents(form, "min_balance", true) : null;
  // The user types the real current balance (to match the bank); store it as an offset from the transactions.
  const aid = form.get("id") ? id(form) : null;
  const { s } = db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE account_id = ?").get(aid) as { s: number };
  const values = [text(form, "name", 40), kind, cents(form, "balance", true) - s, min] as const;
  if (aid) db.prepare("UPDATE accounts SET name = ?, kind = ?, initial_balance = ?, min_balance = ? WHERE id = ?").run(...values, aid);
  else db.prepare("INSERT INTO accounts (name, kind, initial_balance, min_balance) VALUES (?, ?, ?, ?)").run(...values);
  await done();
}

export async function setCurrency(form: FormData) {
  await requireUser();
  const c = String(form.get("currency"));
  if (!CURRENCIES.includes(c as never)) throw new Error("Devise inconnue");
  setSetting("currency", c);
  await done();
}

/** Restores a JSON backup, replacing all budget data. Returns form state for useActionState. */
export async function importData(_: { error?: string; ok?: string }, form: FormData) {
  await requireUser();
  try {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choisissez un fichier de sauvegarde.");
    const backup = parseBackup(await file.text());
    tx(() => {
      db.exec("DELETE FROM accounts"); // cascades to transactions, recurring and planned
      for (const table of ["accounts", "transactions", "recurring", "planned"] as const) {
        const cols = Object.keys(SCHEMA[table]);
        const insert = db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
        for (const row of backup[table]) insert.run(...cols.map((c) => (row[c] ?? null) as number | string | null));
      }
      setSetting("currency", backup.currency);
    });
    await done();
    return { ok: `Import terminé : ${backup.accounts.length} comptes, ${backup.transactions.length} opérations.` };
  } catch (e) {
    // FK violations (e.g. an operation pointing to a missing account) land here; the transaction rolled back.
    return { error: e instanceof Error ? e.message : "Import impossible." };
  }
}
