import type { ReactNode } from "react";
import { getCurrency } from "@/lib/budget";
import { fmt } from "@/lib/forecast";
import type { Account } from "@/lib/forecast";
import { ConfirmButton } from "./client";
import { deleteRow } from "./actions";

export const input =
  "w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink placeholder:text-muted/60 transition-colors focus:border-brass focus:outline-none";
export const button =
  "rounded-xl bg-ink px-4 py-2.5 font-medium text-paper transition-transform duration-150 hover:opacity-90 active:scale-[0.97]";

/** A titled section. `plain` drops the tinted panel for content that should sit on the page itself. */
export function Card({ title, children, action, plain }: { title?: string; children: ReactNode; action?: ReactNode; plain?: boolean }) {
  return (
    <section className="space-y-3">
      {title && (
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="font-display text-xl">{title}</h2>
          {action}
        </div>
      )}
      <div className={plain ? "" : "rounded-3xl border border-line bg-surface p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export function Money({ cents, signed }: { cents: number; signed?: boolean }) {
  const color = !signed ? "" : cents < 0 ? "text-loss" : "text-gain";
  return <span className={`whitespace-nowrap ${color}`}>{signed && cents > 0 ? "+" : ""}{fmt(cents, getCurrency())}</span>;
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 text-sm ${className}`}>
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Rows of a list: date or tag on the left, label in the middle, amount and actions on the right. */
export function Row({ lead, title, sub, children }: { lead: ReactNode; title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-11 shrink-0 text-sm text-muted">{lead}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate">{title}</p>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </li>
  );
}

export const listClass = "divide-y divide-line";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted">{children}</p>;
}

export function DeleteButton({ table, id }: { table: string; id: number }) {
  return (
    <form action={deleteRow}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <ConfirmButton
        message="Supprimer définitivement ?"
        className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-loss/10 hover:text-loss"
        aria-label="Supprimer"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </ConfirmButton>
    </form>
  );
}

/** Form shared by operations, subscriptions and planned expenses. */
export function EntryForm({
  action, accounts, categories, when, today, transfer = true, submit = "Ajouter",
}: {
  action: (f: FormData) => Promise<void>;
  accounts: Account[];
  categories: string[];
  when: "date" | "day";
  today: string;
  transfer?: boolean;
  submit?: string;
}) {
  const options = accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>);
  return (
    // `group` + :has() shows the destination account only for transfers, without client JS.
    <form action={action} className="group grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label="Type">
        <select name="type" className={input} defaultValue="depense">
          <option value="depense">Dépense</option>
          <option value="revenu">Revenu</option>
          {transfer && accounts.length > 1 && <option value="virement">Virement</option>}
        </select>
      </Field>
      <Field label={`Montant (${getCurrency()})`}>
        <input name="amount" required inputMode="decimal" pattern="\d+([.,]\d{1,2})?" placeholder="0,00" className={input} />
      </Field>
      <Field label="Libellé" className="col-span-2">
        <input name="label" required maxLength={80} className={input} />
      </Field>
      <Field label="Compte">
        <select name="account_id" className={input}>{options}</select>
      </Field>
      <Field label="Vers le compte" className="hidden group-has-[option[value=virement]:checked]:block">
        <select name="to_account_id" className={input} defaultValue={accounts[1]?.id}>{options}</select>
      </Field>
      <Field label="Catégorie" className="group-has-[option[value=virement]:checked]:hidden">
        <input name="category" list="categories" maxLength={40} className={input} />
        <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      {when === "date" ? (
        <Field label="Date">
          <input name="date" type="date" required defaultValue={today} className={input} />
        </Field>
      ) : (
        <Field label="Jour du mois">
          <input name="day" type="number" min={1} max={31} required defaultValue={Number(today.slice(8))} className={input} />
        </Field>
      )}
      <div className="col-span-2 flex items-end sm:col-span-1">
        <button className={`${button} w-full`}>{submit}</button>
      </div>
    </form>
  );
}
