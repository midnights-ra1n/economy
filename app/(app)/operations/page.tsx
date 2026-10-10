import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccounts, getCategories, getTransactions, postDueRecurring, transferTwin, type Transaction } from "@/lib/budget";
import { addMonths, localToday, ym } from "@/lib/forecast";
import { getT } from "@/lib/locale";
import { updateTransaction } from "../actions";
import { Card, DeleteButton, EditEntry, Empty, Money, PageHeader, Row, entryValues, listClass } from "../ui";

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
  const categories = getCategories(uid);
  // A transfer is edited from its outgoing side, whichever of its two operations the button is on.
  const values = (tx: Transaction) => {
    const twin = transferTwin(uid, tx);
    if (!twin) return entryValues(tx);
    const [from, to] = tx.amount < 0 ? [tx, twin] : [twin, tx];
    return entryValues({ ...from, id: tx.id, to_account_id: to.account_id });
  };
  const { t, rich, intl } = await getT();
  const label = new Date(`${month}-01T12:00`).toLocaleDateString(intl, { month: "long", year: "numeric" });
  const short = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(intl, { day: "2-digit", month: "2-digit" });

  return (
    <>
      <PageHeader title={t("nav.operations")} sub={t("ops.sub")} />
      {!accounts.length && (
        <Empty>{rich("common.needAccount", { link: <Link href="/comptes" className="text-ink underline">{t("common.account")}</Link> })}</Empty>
      )}

      <Card
        title={label.charAt(0).toUpperCase() + label.slice(1)}
        action={
          <div className="flex gap-2">
            <Link href={`?m=${addMonths(month, -1)}`} className={arrow} aria-label={t("ops.previous")}>‹</Link>
            <Link href={`?m=${addMonths(month, 1)}`} className={arrow} aria-label={t("ops.next")}>›</Link>
          </div>
        }
      >
        {txs.length ? (
          <ul className={listClass}>
            {txs.map((tx) => (
              <Row key={tx.id} lead={short(tx.date)} title={tx.label} sub={[names[tx.account_id], tx.category === "Virement" ? t("entry.transfer") : tx.category].filter(Boolean).join(", ")}>
                <Money cents={tx.amount} signed />
                <EditEntry action={updateTransaction} accounts={accounts} categories={categories} when="date" today={today} values={values(tx)} />
                <DeleteButton table="transactions" id={tx.id} />
              </Row>
            ))}
          </ul>
        ) : <Empty>{t("ops.empty")}</Empty>}
      </Card>
    </>
  );
}
