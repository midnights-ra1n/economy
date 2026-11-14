import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/budget";
import { DEFAULT_CEILING, type Account } from "@/lib/forecast";
import { saveAccount } from "../actions";
import { getT } from "@/lib/locale";
import type { Key } from "@/lib/i18n";
import { Card, DeleteButton, Field, Money, PageHeader, button, input } from "../ui";

// Value of the form's type select: the product, or the plain kind.
const TYPES = ["courant", "resto", "cash", "cash_reserve", "livret_a", "livret_jeune", "pea", "epargne"] as const;
const typeOf = (a: Account) => a.product ?? a.kind;
// Suggestions only: any name can be typed.
const BANKS = ["BoursoBank", "Crédit Agricole", "BNP Paribas", "Société Générale", "LCL", "Caisse d'Épargne", "Banque Populaire", "Crédit Mutuel", "La Banque Postale", "Fortuneo", "Revolut", "Swile"];

type Row = Account & { deposits: number };

async function AccountForm({ account }: { account?: Row }) {
  const { t, locale, intl } = await getT();
  // Plain decimal in the user's notation; parseCents accepts both separators.
  const decimal = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", locale === "fr" ? "," : "."));
  const amount = "-?\\d+([.,]\\d{1,2})?";
  // Legal ceilings are in euros whatever the display currency.
  const euros = (c: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
  return (
    // .if-savings / .if-pea: shown for those types only (globals.css), so the form needs no script.
    <form action={saveAccount} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field label={t("acc.name")} className="col-span-2">
        <input name="name" required maxLength={40} defaultValue={account?.name} placeholder={t("acc.namePlaceholder")} className={input} />
      </Field>
      <Field label={t("acc.type")}>
        <select name="type" defaultValue={account ? typeOf(account) : "courant"} className={input}>
          {TYPES.map((v) => <option key={v} value={v}>{t(`acc.type.${v}` as Key)}</option>)}
        </select>
      </Field>
      <Field label={t("acc.bank")}>
        <input name="bank" maxLength={40} list="banks" defaultValue={account?.bank ?? ""} placeholder={t("acc.optional")} className={input} />
      </Field>
      <Field label={t("acc.balance")}>
        <input name="balance" required inputMode="decimal" pattern={amount} defaultValue={decimal(account?.balance)} className={input} />
      </Field>
      <Field label={t("acc.min")}>
        <input name="min_balance" inputMode="decimal" pattern={amount} defaultValue={decimal(account?.min_balance)} placeholder={t("acc.optional")} className={input} />
      </Field>
      <Field label={t("acc.ceiling")} className="if-savings">
        <input name="ceiling" inputMode="decimal" pattern="\d+([.,]\d{1,2})?" defaultValue={decimal(account?.ceiling)} placeholder={t("acc.ceilingDefault")} className={input} />
      </Field>
      <Field label={t("acc.deposits")} className="if-pea">
        <input name="deposits" inputMode="decimal" pattern={amount} defaultValue={account?.product === "pea" ? decimal(account.deposits) : ""} placeholder="0" className={input} />
      </Field>
      <p className="if-savings col-span-2 text-xs text-muted sm:col-span-4">
        {t("acc.ceilingHelp", { a: euros(DEFAULT_CEILING.livret_a), j: euros(DEFAULT_CEILING.livret_jeune), pea: euros(DEFAULT_CEILING.pea) })}
      </p>
      <button className={`${button} col-span-2 sm:col-span-4 sm:justify-self-end`}>{account ? t("common.save") : t("acc.create")}</button>
    </form>
  );
}

/** How much of the ceiling is used: balance, or deposits for a PEA. */
async function CeilingBar({ account: a }: { account: Row }) {
  const { t, rich } = await getT();
  const used = a.ceiling_used ?? a.balance;
  const pct = Math.min(100, Math.max(0, (used / a.ceiling!) * 100));
  return (
    <div className="mb-4 space-y-1.5 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="text-muted">{t(a.product === "pea" ? "acc.depositsUsed" : "acc.ceilingUsed")}</span>
        <span><Money cents={used} /> / <Money cents={a.ceiling!} /></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-loss" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">
        {used >= a.ceiling! ? t("acc.ceilingReached") : rich("acc.ceilingLeft", { amount: <Money cents={a.ceiling! - used} /> })}
      </p>
    </div>
  );
}

export default async function Comptes() {
  const { id: uid } = await requireUser();
  const accounts = getAccounts(uid);
  const { t } = await getT();
  const banks = [...new Set([...accounts.map((a) => a.bank).filter((b): b is string => !!b), ...BANKS])];
  return (
    <>
      <PageHeader title={t("nav.accounts")} sub={t("acc.sub")} />
      <datalist id="banks">{banks.map((b) => <option key={b} value={b} />)}</datalist>
      <Card title={t("acc.new")}>
        <AccountForm />
      </Card>
      {accounts.map((a) => (
        <Card key={a.id} title={[a.name, a.bank].filter(Boolean).join(" · ")} action={<DeleteButton table="accounts" id={a.id} />}>
          {a.ceiling != null && <CeilingBar account={a} />}
          <AccountForm account={a} />
        </Card>
      ))}
      <p className="px-1 text-sm text-muted">{t("acc.help")}</p>
      <p className="px-1 text-sm text-muted">{t("acc.cashHelp")}</p>
      <p className="px-1 text-sm text-muted">{t("acc.restoHelp")}</p>
    </>
  );
}
