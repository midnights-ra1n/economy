import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories, getPlanned, getRecurring } from "@/lib/budget";
import { localToday } from "@/lib/forecast";
import { addPlanned, addRecurring, payPlanned } from "../actions";
import { Card, DeleteButton, Empty, EntryForm, Money, Row, listClass } from "../ui";

export default async function Previsions() {
  await requireUser();
  const today = localToday();
  const accounts = getAccounts();
  if (!accounts.length) {
    return <Empty>Ajoutez d&apos;abord un <Link href="/comptes" className="text-ink underline">compte</Link>.</Empty>;
  }
  const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const categories = getCategories();
  const recurring = getRecurring();
  const planned = getPlanned();
  // Transfers move money between own accounts: not a cost.
  const monthly = recurring.filter((r) => !r.to_account_id).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <Card title="Chaque mois" action={<span className="text-sm text-muted">Solde mensuel <Money cents={monthly} signed /></span>}>
        <p className="mb-4 text-sm text-muted">Abonnements, salaire, loyer, virements vers l&apos;épargne. Ils sont ajoutés aux opérations le jour venu.</p>
        <EntryForm action={addRecurring} accounts={accounts} categories={categories} when="day" today={today} />
        {recurring.length > 0 && (
          <ul className={`mt-4 border-t border-line ${listClass}`}>
            {recurring.map((r) => (
              <Row
                key={r.id}
                lead={`le ${r.day}`}
                title={r.label}
                sub={r.to_account_id ? `${names[r.account_id]} vers ${names[r.to_account_id]}` : [names[r.account_id], r.category].filter(Boolean).join(", ")}
              >
                <Money cents={r.amount} signed />
                <DeleteButton table="recurring" id={r.id} />
              </Row>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Dépenses prévues">
        <p className="mb-4 text-sm text-muted">Ponctuelles : vacances, réparation, cadeau. Cochez-les une fois payées.</p>
        <EntryForm action={addPlanned} accounts={accounts} categories={categories} when="date" today={today} transfer={false} />
        {planned.length > 0 && (
          <ul className={`mt-4 border-t border-line ${listClass}`}>
            {planned.map((p) => (
              <Row
                key={p.id}
                lead={<span className={p.date < today ? "text-loss" : ""}>{p.date.slice(8)}/{p.date.slice(5, 7)}</span>}
                title={p.label}
                sub={[names[p.account_id], p.category].filter(Boolean).join(", ")}
              >
                <Money cents={p.amount} signed />
                <form action={payPlanned}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-gain/10 hover:text-gain" aria-label="Marquer comme payée" title="Marquer comme payée">
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
