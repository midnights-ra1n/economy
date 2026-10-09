import { cache } from "react";
import { db, getSetting, tx } from "./db";
import { duePosts, localToday, type Account, type Planned, type Recurring } from "./forecast";

export type RecurringRow = Recurring & { category: string | null };
export type PlannedRow = Planned & { category: string | null };
export type Transaction = { id: number; account_id: number; label: string; amount: number; date: string; category: string | null };

export const getAccounts = () =>
  db.prepare(`
    SELECT a.id, a.name, a.kind, a.min_balance, a.initial_balance,
           a.initial_balance + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id), 0) AS balance
    FROM accounts a ORDER BY a.kind, a.name
  `).all() as (Account & { initial_balance: number })[];

export const getRecurring = () => db.prepare("SELECT * FROM recurring ORDER BY day, label").all() as RecurringRow[];
export const getPlanned = () => db.prepare("SELECT * FROM planned ORDER BY date, label").all() as PlannedRow[];

export const getTransactions = (month: string) =>
  db.prepare("SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC, id DESC").all(`${month}-%`) as Transaction[];

export const getCategories = () =>
  (db.prepare(`
    SELECT category FROM transactions WHERE category IS NOT NULL
    UNION SELECT category FROM recurring WHERE category IS NOT NULL ORDER BY 1
  `).all() as { category: string }[]).map((r) => r.category);

/** Turns recurrences whose day has come into real transactions (idempotent, catches up missed months). */
export function postDueRecurring(today = localToday()) {
  const insert = db.prepare("INSERT INTO transactions (account_id, label, amount, date, category) VALUES (?, ?, ?, ?, ?)");
  const mark = db.prepare("UPDATE recurring SET last_posted = ? WHERE id = ?");
  tx(() => {
    for (const r of getRecurring()) {
      const dates = duePosts(r, today);
      for (const d of dates) {
        insert.run(r.account_id, r.label, r.amount, d, r.category);
        if (r.to_account_id) insert.run(r.to_account_id, r.label, -r.amount, d, r.category);
      }
      if (dates.length) mark.run(dates.at(-1)!.slice(0, 7), r.id);
    }
  });
}

/** Display currency, read once per request. Amounts are not converted: it is a display unit. */
export const getCurrency = cache(() => getSetting("currency") ?? "EUR");
