import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/budget";
import type { Account } from "@/lib/forecast";
import { saveAccount } from "../actions";
import { getT } from "@/lib/locale";
import { Card, DeleteButton, Field, button, input } from "../ui";

async function AccountForm({ account }: { account?: Account }) {
  const { t, locale } = await getT();
  // Plain decimal in the user's notation; parseCents accepts both separators.
  const decimal = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", locale === "fr" ? "," : "."));
  return (
    <form action={saveAccount} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field label={t("acc.name")} className="col-span-2 sm:col-span-1">
        <input name="name" required maxLength={40} defaultValue={account?.name} placeholder={t("acc.namePlaceholder")} className={input} />
      </Field>
      <Field label={t("acc.type")}>
        <select name="kind" defaultValue={account?.kind ?? "courant"} className={input}>
          <option value="courant">{t("acc.current")}</option>
          <option value="epargne">{t("acc.savings")}</option>
        </select>
      </Field>
      <Field label={t("acc.balance")}>
        <input name="balance" required inputMode="decimal" pattern="-?\d+([.,]\d{1,2})?" defaultValue={decimal(account?.balance ?? null)} className={input} />
      </Field>
      <Field label={t("acc.min")}>
        <input name="min_balance" inputMode="decimal" pattern="-?\d+([.,]\d{1,2})?" defaultValue={decimal(account?.min_balance ?? null)} placeholder={t("acc.optional")} className={input} />
      </Field>
      <div className="flex items-end">
        <button className={`${button} w-full`}>{account ? t("common.save") : t("acc.create")}</button>
      </div>
    </form>
  );
}

export default async function Comptes() {
  const { id: uid } = await requireUser();
  const accounts = getAccounts(uid);
  const { t } = await getT();
  return (
    <>
      <Card title={t("acc.new")}>
        <AccountForm />
      </Card>
      {accounts.map((a) => (
        <Card key={a.id} title={a.name} action={<DeleteButton table="accounts" id={a.id} />}>
          <AccountForm account={a} />
        </Card>
      ))}
      <p className="px-1 text-sm text-muted">
        {t("acc.help")}
      </p>
    </>
  );
}
