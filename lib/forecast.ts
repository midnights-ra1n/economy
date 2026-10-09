// Pure budget logic (no DB, no Next) so it can be tested with `node --test`.
// Amounts are integer cents. Dates are local "YYYY-MM-DD", months "YYYY-MM".

export type Account = { id: number; name: string; kind: string; balance: number; min_balance: number | null };
// amount is signed for account_id; to_account_id (transfer) receives -amount.
export type Recurring = { id: number; label: string; amount: number; day: number; account_id: number; to_account_id: number | null; last_posted: string };
export type Planned = { id: number; label: string; amount: number; date: string; account_id: number };

export const ym = (date: string) => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Date of a monthly recurrence, clamped to the month's last day (31 → 28 in February). */
export function dayInMonth(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Recurrence dates not yet posted, up to and including today. */
export function duePosts(rec: Pick<Recurring, "day" | "last_posted">, today: string): string[] {
  const dates: string[] = [];
  for (let m = addMonths(rec.last_posted, 1); m <= ym(today); m = addMonths(m, 1)) {
    const d = dayInMonth(m, rec.day);
    if (d <= today) dates.push(d);
  }
  return dates;
}

/** "12,50" | "12.5" | "-3" → cents. Returns null when not a number. */
export function parseCents(input: string): number | null {
  const s = input.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

const formatters = new Map<string, Intl.NumberFormat>();
export function fmt(cents: number, currency = "EUR", intl = "fr-FR"): string {
  const id = `${intl}:${currency}`;
  if (!formatters.has(id)) formatters.set(id, new Intl.NumberFormat(intl, { style: "currency", currency }));
  return formatters.get(id)!.format(cents / 100);
}

export type MonthForecast = { month: string; balances: Record<number, number> };
export type Alert = { account: Account; month: string; balance: number };

/**
 * End-of-month balances for `months` months starting with the current one.
 * Current month: only recurrences after today (earlier ones are already posted) and
 * unpaid planned expenses up to month end (overdue ones included).
 */
export function forecast(accounts: Account[], recurring: Recurring[], planned: Planned[], today: string, months = 6) {
  const bal: Record<number, number> = Object.fromEntries(accounts.map((a) => [a.id, a.balance]));
  const add = (id: number | null, v: number) => {
    if (id != null && id in bal) bal[id] += v;
  };
  const result: MonthForecast[] = [];
  const alerts: Alert[] = [];
  const current = ym(today);
  for (let i = 0; i < months; i++) {
    const month = addMonths(current, i);
    for (const r of recurring) {
      if (i > 0 || dayInMonth(month, r.day) > today) {
        add(r.account_id, r.amount);
        add(r.to_account_id, -r.amount);
      }
    }
    for (const p of planned) if (i === 0 ? ym(p.date) <= month : ym(p.date) === month) add(p.account_id, p.amount);
    result.push({ month, balances: { ...bal } });
    for (const a of accounts) {
      if (a.min_balance != null && bal[a.id] < a.min_balance && !alerts.some((x) => x.account.id === a.id)) {
        alerts.push({ account: a, month, balance: bal[a.id] });
      }
    }
  }
  return { months: result, alerts };
}

/**
 * Running total of spending at the end of each of the first `days` days of a month, in cents.
 * Transfers are not spending; operations dated after `days` (entered ahead, not spent yet) are left out.
 */
export function cumulativeSpending(txs: { date: string; amount: number; category: string | null }[], days: number): number[] {
  const perDay = Array<number>(days).fill(0);
  for (const t of txs) {
    const i = Number(t.date.slice(8)) - 1;
    if (t.amount < 0 && t.category !== "Virement" && i < days) perDay[i] -= t.amount;
  }
  let sum = 0;
  return perDay.map((v) => (sum += v));
}
