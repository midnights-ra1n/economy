// Account statements: periods and figures. Pure: tested with `node --test`.
import { addMonths, dayInMonth, localToday, ym } from "./forecast.ts";

export type Kind = "week" | "month" | "custom";
export type Frequency = "off" | "weekly" | "monthly";
export type Period = { kind: Kind; start: string; end: string }; // inclusive dates

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localToday(d);
};

/** The calendar month, or the Monday-to-Sunday week, that contains `date`. */
export function periodOf(kind: "week" | "month", date: string): Period {
  if (kind === "month") return { kind, start: `${ym(date)}-01`, end: dayInMonth(ym(date), 31) };
  const monday = addDays(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
  return { kind, start: monday, end: addDays(monday, 6) };
}

/**
 * The last period fully over on `today`: what an automatic statement covers.
 * A month is only due from its sending `day` of the next month (null before), e.g. after deferred card debits.
 */
export function lastCompleted(frequency: Exclude<Frequency, "off">, today: string, day = 1): Period | null {
  if (frequency === "monthly" && Number(today.slice(8)) < day) return null;
  return frequency === "monthly" ? periodOf("month", `${addMonths(ym(today), -1)}-01`) : periodOf("week", addDays(today, -7));
}

export type Tx = { account_id: number; date: string; label: string; category: string | null; amount: number };
export type AccountIn = { id: number; name: string; kind: string; initial_balance: number };
export type Line = Tx & { balance: number };
export type AccountStatement = { id: number; name: string; kind: string; opening: number; closing: number; income: number; expenses: number; lines: Line[] };
export type Figures = {
  accounts: AccountStatement[];
  totals: { opening: number; closing: number; income: number; expenses: number };
  categories: [string | null, number][];
};

// Transfers between own accounts are neither income nor spending (they still move each account's balance).
const TRANSFER = "Virement";

/** Opening and closing balances, income, spending and running balance of each account over [start, end]. */
export function statementFigures(accounts: AccountIn[], txs: Tx[], start: string, end: string): Figures {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const byCategory = new Map<string | null, number>();
  const list = accounts.map((a) => {
    const own = sorted.filter((t) => t.account_id === a.id && t.date <= end);
    const opening = a.initial_balance + own.filter((t) => t.date < start).reduce((s, t) => s + t.amount, 0);
    let balance = opening;
    let income = 0;
    let expenses = 0;
    const lines = own.filter((t) => t.date >= start).map((t) => {
      balance += t.amount;
      if (t.category !== TRANSFER) {
        if (t.amount > 0) income += t.amount;
        else {
          expenses -= t.amount;
          byCategory.set(t.category, (byCategory.get(t.category) ?? 0) - t.amount);
        }
      }
      return { ...t, balance };
    });
    return { id: a.id, name: a.name, kind: a.kind, opening, closing: balance, income, expenses, lines };
  });
  const sum = (k: "opening" | "closing" | "income" | "expenses") => list.reduce((s, a) => s + a[k], 0);
  return {
    accounts: list,
    totals: { opening: sum("opening"), closing: sum("closing"), income: sum("income"), expenses: sum("expenses") },
    categories: [...byCategory].sort((a, b) => b[1] - a[1]),
  };
}
