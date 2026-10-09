import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/backup";
import { getCurrency } from "@/lib/budget";
import { db } from "@/lib/db";
import { changePassword, deletePasskey, logout } from "../../login/actions";
import { AddPasskeyForm } from "../../login/passkey-forms";
import { importData, setCurrency } from "../actions";
import { ConfirmButton, MessageForm } from "../client";
import { Card, Field, button, input, listClass } from "../ui";

const ghost = "rounded-xl border border-line px-4 py-2.5 text-center font-medium transition-colors hover:bg-paper";
const names: Record<string, string> = { EUR: "Euro (€)", USD: "Dollar US ($)", GBP: "Livre sterling (£)", CHF: "Franc suisse (CHF)", CAD: "Dollar canadien ($ CA)", JPY: "Yen (¥)" };

export default async function Reglages() {
  await requireUser();
  const passkeys = db.prepare("SELECT id, name, created_at FROM credentials ORDER BY created_at").all() as {
    id: string; name: string; created_at: string;
  }[];
  return (
    <>
      <Card title="Devise">
        <form action={setCurrency} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Devise d'affichage" className="flex-1">
            <select name="currency" defaultValue={getCurrency()} className={input}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{names[c]}</option>)}
            </select>
          </Field>
          <button className={button}>Enregistrer</button>
        </form>
        <p className="mt-3 text-sm text-muted">Change seulement l&apos;affichage : les montants ne sont pas convertis.</p>
      </Card>

      <Card title="Mot de passe">
        <MessageForm action={changePassword} className="grid gap-3 sm:grid-cols-3">
          <Field label="Actuel"><input name="current" type="password" required autoComplete="current-password" className={input} /></Field>
          <Field label="Nouveau"><input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <Field label="Confirmer"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <button className={`${button} sm:col-start-3`}>Changer le mot de passe</button>
        </MessageForm>
      </Card>

      <Card title="Passkeys">
        <p className="mb-3 text-sm text-muted">Facultatif : connectez-vous avec Face ID, Touch ID ou Windows Hello au lieu du mot de passe.</p>
        {passkeys.length > 0 && (
          <ul className={`mb-4 ${listClass}`}>
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                <div>
                  <p>{p.name}</p>
                  <p className="text-xs text-muted">ajoutée le {new Date(`${p.created_at}Z`).toLocaleDateString("fr-FR")}</p>
                </div>
                <form action={deletePasskey}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton message="Supprimer cette passkey ?" className="text-sm text-loss hover:underline">Supprimer</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddPasskeyForm />
      </Card>

      <Card title="Données">
        <p className="mb-3 text-sm text-muted">Vos données sont stockées sur votre serveur et synchronisées sur tous vos appareils.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href="/export?format=json" className={ghost} download>Exporter une sauvegarde (JSON)</a>
          <a href="/export?format=csv" className={ghost} download>Exporter les opérations (CSV)</a>
        </div>
        <MessageForm action={importData} className="mt-5 space-y-3 border-t border-line pt-5">
          <Field label="Restaurer une sauvegarde JSON">
            <input name="file" type="file" accept="application/json,.json" required className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-1 file:text-paper`} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-1 accent-[var(--loss)]" />
            <span>Je comprends que l&apos;import remplace tous mes comptes, opérations et prévisions actuels.</span>
          </label>
          <button className={button}>Importer</button>
        </MessageForm>
      </Card>

      <form action={logout}>
        <button className={`${ghost} w-full`}>Se déconnecter</button>
      </form>
    </>
  );
}
