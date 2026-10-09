import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCurrency, getPlanned, getRecurring, getTransactions, postDueRecurring, type Transaction } from "@/lib/budget";
import { addMonths, dayInMonth, fmt, forecast, localToday, ym } from "@/lib/forecast";
import { getT } from "@/lib/locale";
import { MonthCalendar } from "./calendar";
import { ForecastChart, SpendingChart } from "./charts";
import { Card, Empty, Money } from "./ui";

const isSpending = (t: Transaction) => t.amount < 0 && t.category !== "Virement";

/** Running total of spending at the end of each day of the month, in cents. */
function cumulative(txs: Transaction[], days: number): number[] {
  const perDay = Array<number>(days).fill(0);
  for (const t of txs) if (isSpending(t)) perDay[Number(t.date.slice(8)) - 1] -= t.amount;
  let sum = 0;
  return perDay.map((v) => (sum += v));
}

export default async function Dashboard() {
  const { id: uid } = await requireUser();
  const today = localToday();
  postDueRecurring(uid, today);
  const accounts = getAccounts(uid);
  const { t, rich, intl } = await getT();
  const monthName = (m: string, style: "long" | "short" = "long") => new Date(`${m}-01T12:00`).toLocaleDateString(intl, { month: style });
  if (!accounts.length) {
    return (
      <section className="anim-rise space-y-4 pt-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("dash.emptyTitle")}</h1>
        <p className="max-w-prose text-muted">{t("dash.emptyText")}</p>
        <Link href="/comptes" className="inline-block rounded-xl bg-ink px-5 py-3 font-medium text-paper">{t("dash.addAccount")}</Link>
      </section>
    );
  }
  const short = new Intl.NumberFormat(intl, { style: "currency", currency: await getCurrency(), maximumFractionDigits: 0 });
  const recurring = getRecurring(uid);
  const planned = getPlanned(uid);
  const { months, alerts } = forecast(accounts, recurring, planned, today);
  const month = ym(today);
  const prevMonth = addMonths(month, -1);
  const sum = (b: Record<number, number>) => Object.values(b).reduce((s, v) => s + v, 0);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const endTotal = sum(months[0].balances);

  // Spending: this month so far vs the previous month at the same day.
  const txs = getTransactions(uid, month);
  const todayDay = Number(today.slice(8));
  const current = cumulative(txs, todayDay);
  const previous = cumulative(getTransactions(uid, prevMonth), Number(dayInMonth(prevMonth, 31).slice(8)));
  const spentSoFar = current.at(-1) ?? 0;
  const prevSameDay = previous[Math.min(todayDay, previous.length) - 1] ?? 0;
  const income = txs.filter((x) => x.amount > 0 && x.category !== "Virement").reduce((s, x) => s + x.amount, 0);
  const byCategory = Object.entries(
    txs.filter(isSpending).reduce<Record<string, number>>((acc, tx) => {
      const c = tx.category ?? t("dash.uncategorized");
      acc[c] = (acc[c] ?? 0) - tx.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // Calendar: every recurrence of this month (past ones already posted) and this month's planned expenses.
  const currency = await getCurrency();
  const display = (cents: number, transfer: boolean) => `${!transfer && cents > 0 ? "+" : ""}${fmt(cents, currency, intl)}`;
  const calendar = [
    ...recurring.map((r) => ({ key: `r${r.id}`, date: dayInMonth(month, r.day), label: r.label, amount: r.amount, transfer: !!r.to_account_id })),
    ...planned.filter((p) => ym(p.date) === month).map((p) => ({ key: `p${p.id}`, date: p.date, label: p.label, amount: p.amount, transfer: false })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((it) => ({ ...it, display: display(it.amount, it.transfer) }));

  const points = [
    { label: t("dash.today"), value: total, display: short.format(total / 100) },
    ...months.map((m) => {
      const v = sum(m.balances);
      return { label: monthName(m.month, "short"), value: v, display: short.format(v / 100) };
    }),
  ];

  return (
    <>
      <section className="space-y-6">
        <div className="anim-rise space-y-5">
          <h1 className="max-w-3xl text-[2.1rem] leading-[1.08] font-semibold tracking-tight sm:text-6xl">
            {rich(endTotal >= 0 ? "dash.heroLeft" : "dash.heroShort", {
              amount: <Money cents={endTotal} sans className={endTotal < 0 ? "text-loss" : ""} />,
            }, { month: monthName(month) })}
          </h1>
          {/* Current accounts first: that is the money available to spend. */}
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {accounts.map((a) => (
              <li key={a.id} className="space-y-1 bg-surface p-4">
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <span className={`size-1.5 rounded-full ${a.kind === "courant" ? "bg-accent" : "bg-muted/50"}`} />
                  <span className="truncate">{a.name}</span>
                </p>
                <p className="text-lg font-medium"><Money cents={a.balance} /></p>
                <p className="text-xs text-muted">
                  {t("dash.endOf", { month: monthName(month, "short") })}{" "}
                  <Money cents={months[0].balances[a.id]} className={months[0].balances[a.id] < a.balance ? "text-loss" : "text-gain"} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Card title={t("dash.projection")} plain>
        <ForecastChart points={points} label={t("dash.projectionAria")} />
        <details className="group mt-4">
          <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> {t("dash.byAccount")}
          </summary>
          <div className="-mx-4 mt-3 overflow-x-auto px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-3 font-normal">{t("dash.endOfCol")}</th>
                  {accounts.map((a) => <th key={a.id} className="py-1 pr-3 text-right font-normal">{a.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-t border-line">
                    <td className="py-1.5 pr-3 capitalize">{monthName(m.month)}</td>
                    {accounts.map((a) => {
                      const low = a.min_balance != null && m.balances[a.id] < a.min_balance;
                      return (
                        <td key={a.id} className="py-1.5 pr-3 text-right">
                          <Money cents={m.balances[a.id]} className={low ? "font-semibold text-loss" : ""} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      {alerts.map((a) => (
        <p key={a.account.id} role="alert" className="flex gap-3 rounded-2xl border border-loss/30 bg-loss/5 p-4 text-sm">
          <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-loss" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3l10 18H2zM12 10v5M12 18v.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            {rich("dash.alert", {
              account: <strong className="font-semibold">{a.account.name}</strong>,
              balance: <Money cents={a.balance} />,
              min: <Money cents={a.account.min_balance!} />,
            }, { month: monthName(a.month) })}
          </span>
        </p>
      ))}

      <Card title={t("dash.spending")}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-3xl font-medium"><Money cents={spentSoFar} /></p>
            <p className="text-sm text-muted">
              {prevSameDay > 0
                ? rich("dash.vsPrevious", {
                    pct: (
                      <span className={spentSoFar > prevSameDay ? "text-loss" : "text-gain"}>
                        {spentSoFar > prevSameDay ? "+" : "−"}
                        {Math.abs(Math.round(((spentSoFar - prevSameDay) / prevSameDay) * 100)).toLocaleString(intl, { style: "unit", unit: "percent" })}
                      </span>
                    ),
                  }, { date: new Date(`${prevMonth}-${String(Math.min(todayDay, previous.length)).padStart(2, "0")}T12:00`).toLocaleDateString(intl, { day: "numeric", month: "long" }) })
                : t("dash.sinceFirst")}
            </p>
          </div>
          <p className="text-sm text-muted">{t("dash.income")} <Money cents={income} signed /></p>
        </div>
        <SpendingChart current={current} previous={previous} />
        <p className="mt-3 flex gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-accent" />{monthName(month)}</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-muted" />{monthName(prevMonth)}</span>
        </p>
      </Card>

      <Card title={t("dash.scheduled")} action={<Link href="/previsions" className="text-sm text-muted hover:text-ink">{t("dash.manage")}</Link>}>
        <MonthCalendar month={month} today={today} items={calendar} />
      </Card>

      <Card title={t("dash.byCategory")}>
        {byCategory.length ? (
          <ul className="space-y-3 text-sm">
            {byCategory.map(([c, v]) => (
              <li key={c} className="space-y-1.5">
                <div className="flex justify-between gap-2"><span className="truncate">{c}</span><Money cents={v} /></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="anim-grow h-full rounded-full bg-ink" style={{ width: `${(v / byCategory[0][1]) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty>{t("dash.noSpending")}</Empty>}
      </Card>
    </>
  );
}
