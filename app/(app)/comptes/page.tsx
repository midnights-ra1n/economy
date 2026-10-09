import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/budget";
import type { Account } from "@/lib/forecast";
import { saveAccount } from "../actions";
import { Card, DeleteButton, Field, button, input } from "../ui";

const euros = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

function AccountForm({ account }: { account?: Account }) {
  return (
    <form action={saveAccount} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field label="Nom" className="col-span-2 sm:col-span-1">
        <input name="name" required maxLength={40} defaultValue={account?.name} placeholder="Livret A" className={input} />
      </Field>
      <Field label="Type">
        <select name="kind" defaultValue={account?.kind ?? "courant"} className={input}>
          <option value="courant">Courant</option>
          <option value="epargne">Épargne</option>
        </select>
      </Field>
      <Field label="Solde actuel">
        <input name="balance" required inputMode="decimal" pattern="-?\d+([.,]\d{1,2})?" defaultValue={euros(account?.balance ?? null)} className={input} />
      </Field>
      <Field label="Ne pas descendre sous">
        <input name="min_balance" inputMode="decimal" pattern="-?\d+([.,]\d{1,2})?" defaultValue={euros(account?.min_balance ?? null)} placeholder="facultatif" className={input} />
      </Field>
      <div className="flex items-end">
        <button className={`${button} w-full`}>{account ? "Enregistrer" : "Créer"}</button>
      </div>
    </form>
  );
}

export default async function Comptes() {
  await requireUser();
  const accounts = getAccounts();
  return (
    <>
      <Card title="Nouveau compte">
        <AccountForm />
      </Card>
      {accounts.map((a) => (
        <Card key={a.id} title={a.name} action={<DeleteButton table="accounts" id={a.id} />}>
          <AccountForm account={a} />
        </Card>
      ))}
      <p className="px-1 text-sm text-muted">
        Le minimum est une règle : la projection vous alerte si le compte risque de passer en dessous. Supprimer un compte supprime ses opérations.
      </p>
    </>
  );
}
