import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCurrency, getPlanned, getRecurring, getTransactions, postDueRecurring } from "@/lib/budget";
import { dayInMonth, forecast, localToday, ym } from "@/lib/forecast";
import { ForecastChart } from "./forecast-chart";
import { Card, Empty, Money, Row, listClass } from "./ui";

const monthName = (m: string, style: "long" | "short" = "long") =>
  new Date(`${m}-01T12:00`).toLocaleDateString("fr-FR", { month: style });

export default async function Dashboard() {
  await requireUser();
  const today = localToday();
  postDueRecurring(today);
  const accounts = getAccounts();
  if (!accounts.length) {
    return (
      <section className="anim-rise space-y-4 pt-6">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Commençons par vos comptes.</h1>
        <p className="max-w-prose text-muted">Ajoutez votre compte courant et vos livrets avec leur solde actuel : la projection se construit à partir d&apos;eux.</p>
        <Link href="/comptes" className="inline-block rounded-xl bg-ink px-5 py-3 font-medium text-paper">Ajouter un compte</Link>
      </section>
    );
  }
  const currency = getCurrency();
  const short = new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 });
  const recurring = getRecurring();
  const planned = getPlanned();
  const { months, alerts } = forecast(accounts, recurring, planned, today);
  const month = ym(today);
  const sum = (b: Record<number, number>) => Object.values(b).reduce((s, v) => s + v, 0);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const endTotal = sum(months[0].balances);

  const txs = getTransactions(month).filter((t) => t.category !== "Virement");
  const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const byCategory = Object.entries(
    txs.filter((t) => t.amount < 0).reduce<Record<string, number>>((acc, t) => {
      const c = t.category ?? "Sans catégorie";
      acc[c] = (acc[c] ?? 0) - t.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const upcoming = [
    ...recurring
      .filter((r) => dayInMonth(month, r.day) > today)
      .map((r) => ({ key: `r${r.id}`, date: dayInMonth(month, r.day), label: r.label, amount: r.amount, tag: "mensuel" })),
    ...planned.filter((p) => ym(p.date) <= month).map((p) => ({ key: `p${p.id}`, date: p.date, label: p.label, amount: p.amount, tag: "prévu" })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const points = [
    { label: "auj.", value: total, display: short.format(total / 100) },
    ...months.map((m) => {
      const v = sum(m.balances);
      return { label: monthName(m.month, "short"), value: v, display: short.format(v / 100) };
    }),
  ];

  return (
    <>
      <section className="space-y-6 pt-2">
        <div className="anim-rise space-y-2">
          <p className="text-muted">
            Aujourd&apos;hui, <Money cents={total} /> sur {accounts.length} compte{accounts.length > 1 ? "s" : ""}.
          </p>
          <h1 className="max-w-3xl font-display text-[2.1rem] leading-[1.1] sm:text-6xl">
            {endTotal >= 0 ? (
              <>Il vous restera <Money cents={endTotal} /> fin {monthName(month)}.</>
            ) : (
              <>Vous serez à <span className="text-loss"><Money cents={endTotal} /></span> fin {monthName(month)}.</>
            )}
          </h1>
        </div>
        <ForecastChart points={points} />
      </section>

      {alerts.map((a) => (
        <p key={a.account.id} role="alert" className="flex gap-3 rounded-2xl border border-brass/50 bg-brass/10 p-4">
          <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-brass" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3l10 18H2zM12 10v5M12 18v.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <strong className="font-semibold">{a.account.name}</strong> passera à <Money cents={a.balance} /> fin {monthName(a.month)}, sous
            votre minimum de <Money cents={a.account.min_balance!} />.
          </span>
        </p>
      ))}

      <dl className="grid grid-cols-3 divide-x divide-line rounded-3xl border border-line bg-surface">
        {[
          ["Revenus du mois", income],
          ["Dépenses du mois", spent],
          ["Reste", income + spent],
        ].map(([label, v]) => (
          <div key={label} className="space-y-1 p-3 sm:p-5">
            <dt className="text-xs text-muted sm:text-sm">{label}</dt>
            <dd className="text-base font-semibold sm:text-xl"><Money cents={v as number} signed /></dd>
          </div>
        ))}
      </dl>

      <Card title="Comptes" action={<Link href="/comptes" className="text-sm text-muted hover:text-ink">Modifier</Link>}>
        <ul className={listClass}>
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-muted">
                  {a.kind === "epargne" ? "Épargne" : "Courant"}
                  {a.min_balance != null && <>, minimum <Money cents={a.min_balance} /></>}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold"><Money cents={a.balance} /></p>
                <p className="text-xs text-muted">fin de mois <Money cents={months[0].balances[a.id]} /></p>
              </div>
            </li>
          ))}
        </ul>
        <details className="group mt-2 border-t border-line pt-3">
          <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> Projection par compte sur 6 mois
          </summary>
          <div className="-mx-4 mt-3 overflow-x-auto px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-3 font-normal">Fin de</th>
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
                        <td key={a.id} className={`py-1.5 pr-3 text-right ${low ? "font-semibold text-loss" : ""}`}>
                          <Money cents={m.balances[a.id]} />
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

      <div className="grid gap-8 sm:grid-cols-2 sm:gap-6">
        <Card title="À venir ce mois" action={<Link href="/previsions" className="text-sm text-muted hover:text-ink">Gérer</Link>}>
          {upcoming.length ? (
            <ul className={listClass}>
              {upcoming.map((u) => (
                <Row key={u.key} lead={`${u.date.slice(8)}/${u.date.slice(5, 7)}`} title={u.label} sub={u.tag}>
                  <Money cents={u.amount} signed />
                </Row>
              ))}
            </ul>
          ) : <Empty>Rien d&apos;autre de prévu ce mois-ci.</Empty>}
        </Card>
        <Card title="Dépenses par catégorie">
          {byCategory.length ? (
            <ul className="space-y-3 text-sm">
              {byCategory.map(([c, v]) => (
                <li key={c} className="space-y-1">
                  <div className="flex justify-between gap-2"><span className="truncate">{c}</span><Money cents={v} /></div>
                  <div className="h-2 overflow-hidden rounded-full bg-line/60">
                    <div className="anim-grow h-full rounded-full bg-ink" style={{ width: `${(v / byCategory[0][1]) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Aucune dépense enregistrée ce mois-ci.</Empty>}
        </Card>
      </div>
    </>
  );
}
