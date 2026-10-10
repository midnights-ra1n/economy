import { cache } from "react";
import { currentUser } from "./auth";
import { db, tx } from "./db";
import { duePosts, localToday, type Account, type Planned, type Recurring } from "./forecast";

export type RecurringRow = Recurring & { category: string | null };
export type PlannedRow = Planned & { category: string | null };
export type Transaction = { id: number; account_id: number; label: string; amount: number; date: string; category: string | null };

// Every budget row belongs to a user through its account: all reads and writes are scoped by user id.
export const OWN = "account_id IN (SELECT id FROM accounts WHERE user_id = ?)";

export const getAccounts = (uid: number) =>
  db.prepare(`
    SELECT a.id, a.name, a.kind, a.min_balance, a.initial_balance,
           a.initial_balance + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id), 0) AS balance
    FROM accounts a WHERE a.user_id = ? ORDER BY a.kind, a.name
  `).all(uid) as (Account & { initial_balance: number })[];

export const getRecurring = (uid: number) => db.prepare(`SELECT * FROM recurring WHERE ${OWN} ORDER BY day, label`).all(uid) as RecurringRow[];
export const getPlanned = (uid: number) => db.prepare(`SELECT * FROM planned WHERE ${OWN} ORDER BY date, label`).all(uid) as PlannedRow[];

export const getTransactions = (uid: number, month: string) =>
  db.prepare(`SELECT * FROM transactions WHERE ${OWN} AND date LIKE ? ORDER BY date DESC, id DESC`).all(uid, `${month}-%`) as Transaction[];

/** The other side of a transfer, stored as two operations: same label and date, opposite amount, another account. */
export const transferTwin = (uid: number, t: Transaction) =>
  t.category !== "Virement" ? undefined : db.prepare(`
    SELECT * FROM transactions WHERE ${OWN} AND category = 'Virement' AND label = ? AND date = ? AND amount = ? AND account_id != ?
    ORDER BY abs(id - ?) LIMIT 1
  `).get(uid, t.label, t.date, -t.amount, t.account_id, t.id) as Transaction | undefined;

export const getCategories = (uid: number) =>
  (db.prepare(`
    SELECT category FROM transactions WHERE category IS NOT NULL AND ${OWN}
    UNION SELECT category FROM recurring WHERE category IS NOT NULL AND ${OWN} ORDER BY 1
  `).all(uid, uid) as { category: string }[]).map((r) => r.category);

/** Throws unless every given account id belongs to the user (form fields are attacker-controlled). */
export function assertOwnAccounts(uid: number, ...ids: (number | null)[]) {
  for (const id of ids) {
    if (id !== null && !db.prepare("SELECT 1 FROM accounts WHERE id = ? AND user_id = ?").get(id, uid)) throw new Error("Unknown account");
  }
}

/** Turns recurrences whose day has come into real transactions (idempotent, catches up missed months). */
export function postDueRecurring(uid: number, today = localToday()) {
  const insert = db.prepare("INSERT INTO transactions (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)");
  const mark = db.prepare("UPDATE recurring SET last_posted = ? WHERE id = ?");
  tx(() => {
    for (const r of getRecurring(uid)) {
      const dates = duePosts(r, today);
      for (const d of dates) {
        insert.run(r.account_id, r.label, r.amount, d, r.category);
        if (r.to_account_id) insert.run(r.to_account_id, r.label, -r.amount, d, r.category);
      }
      if (dates.length) mark.run(dates.at(-1)!.slice(0, 7), r.id);
    }
  });
}

/** Deletes all of a user's banking data: accounts (cascading to operations and forecasts) and statements.
 * Login, passkeys and preferences stay. */
export const wipeBudget = (uid: number) =>
  tx(() => {
    db.prepare("DELETE FROM accounts WHERE user_id = ?").run(uid);
    db.prepare("DELETE FROM statements WHERE user_id = ?").run(uid);
  });

/** Display currency of the logged-in user. Amounts are not converted: it is a display unit. */
export const getCurrency = cache(async () => (await currentUser())?.currency ?? "EUR");
