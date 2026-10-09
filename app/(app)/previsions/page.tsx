import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories, getPlanned, getRecurring } from "@/lib/budget";
import { localToday } from "@/lib/forecast";
import { addPlanned, addRecurring, payPlanned } from "../actions";
import { getT } from "@/lib/locale";
import { Card, DeleteButton, Empty, EntryForm, Money, PageHeader, Row, listClass } from "../ui";

export default async function Previsions() {
  const { id: uid } = await requireUser();
  const today = localToday();
  const accounts = getAccounts(uid);
  const { t, rich, intl } = await getT();
  if (!accounts.length) {
    return <Empty>{rich("common.needAccount", { link: <Link href="/comptes" className="text-ink underline">{t("common.account")}</Link> })}</Empty>;
  }
  const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const categories = getCategories(uid);
  const recurring = getRecurring(uid);
  const planned = getPlanned(uid);
  // Transfers move money between own accounts: not a cost.
  const monthly = recurring.filter((r) => !r.to_account_id).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader title={t("nav.forecast")} sub={t("fc.sub")} />
      <Card title={t("fc.monthly")} action={<span className="text-sm text-muted">{t("fc.monthlyNet")} <Money cents={monthly} signed /></span>}>
        <p className="mb-4 text-sm text-muted">{t("fc.monthlyHelp")}</p>
        <EntryForm action={addRecurring} accounts={accounts} categories={categories} when="day" today={today} />
        {recurring.length > 0 && (
          <ul className={`mt-4 border-t border-line ${listClass}`}>
            {recurring.map((r) => (
              <Row
                key={r.id}
                lead={t("fc.onDay", { day: r.day })}
                title={r.label}
                sub={r.to_account_id ? t("fc.fromTo", { from: names[r.account_id], to: names[r.to_account_id] }) : [names[r.account_id], r.category].filter(Boolean).join(", ")}
              >
                <Money cents={r.amount} signed />
                <DeleteButton table="recurring" id={r.id} />
              </Row>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("fc.planned")}>
        <p className="mb-4 text-sm text-muted">{t("fc.plannedHelp")}</p>
        <EntryForm action={addPlanned} accounts={accounts} categories={categories} when="date" today={today} transfer={false} />
        {planned.length > 0 && (
          <ul className={`mt-4 border-t border-line ${listClass}`}>
            {planned.map((p) => (
              <Row
                key={p.id}
                lead={<span className={p.date < today ? "text-loss" : ""}>{new Date(`${p.date}T12:00`).toLocaleDateString(intl, { day: "2-digit", month: "2-digit" })}</span>}
                title={p.label}
                sub={[names[p.account_id], p.category].filter(Boolean).join(", ")}
              >
                <Money cents={p.amount} signed />
                <form action={payPlanned}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-gain/10 hover:text-gain" aria-label={t("fc.markPaid")} title={t("fc.markPaid")}>
                    <svg viewBox="0 0 16 16" className="size-4" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </form>
                <DeleteButton table="planned" id={p.id} />
              </Row>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
