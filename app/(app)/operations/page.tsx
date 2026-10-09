import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccounts, getTransactions, postDueRecurring } from "@/lib/budget";
import { addMonths, localToday, ym } from "@/lib/forecast";
import { Card, DeleteButton, Empty, Money, Row, listClass } from "../ui";

const arrow = "grid size-9 place-items-center rounded-full border border-line transition-colors hover:bg-surface";

export default async function Operations({ searchParams }: PageProps<"/operations">) {
  const { id: uid } = await requireUser();
  const today = localToday();
  postDueRecurring(uid, today);
  const m = (await searchParams).m;
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : ym(today);
  const accounts = getAccounts(uid);
  const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const txs = getTransactions(uid, month);
  const label = new Date(`${month}-01T12:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      {!accounts.length && (
        <Empty>Ajoutez d&apos;abord un <Link href="/comptes" className="text-ink underline">compte</Link>.</Empty>
      )}

      <Card
        title={label.charAt(0).toUpperCase() + label.slice(1)}
        action={
          <div className="flex gap-2">
            <Link href={`?m=${addMonths(month, -1)}`} className={arrow} aria-label="Mois précédent">‹</Link>
            <Link href={`?m=${addMonths(month, 1)}`} className={arrow} aria-label="Mois suivant">›</Link>
          </div>
        }
      >
        {txs.length ? (
          <ul className={listClass}>
            {txs.map((t) => (
              <Row key={t.id} lead={`${t.date.slice(8)}/${t.date.slice(5, 7)}`} title={t.label} sub={[names[t.account_id], t.category].filter(Boolean).join(", ")}>
                <Money cents={t.amount} signed />
                <DeleteButton table="transactions" id={t.id} />
              </Row>
            ))}
          </ul>
        ) : <Empty>Aucune opération ce mois-ci. Ajoutez-en une avec le bouton +.</Empty>}
      </Card>
    </>
  );
}
