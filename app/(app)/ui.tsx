import type { ReactNode } from "react";
import { getCurrency } from "@/lib/budget";
import { fmt } from "@/lib/forecast";
import type { Account } from "@/lib/forecast";
import { ConfirmButton } from "./client";
import { deleteRow } from "./actions";

export const input =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted/60 transition-colors focus:border-accent focus:outline-none";
export const button =
  "rounded-xl bg-ink px-4 py-2.5 font-medium text-paper transition-transform duration-150 hover:opacity-90 active:scale-[0.97]";

/** A titled section. `plain` drops the panel for content that should sit on the page itself. */
export function Card({ title, children, action, plain }: { title?: string; children: ReactNode; action?: ReactNode; plain?: boolean }) {
  return (
    <section className="space-y-3">
      {title && (
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {action}
        </div>
      )}
      <div className={plain ? "" : "rounded-2xl border border-line bg-surface p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

/** Amounts in Geist Mono; `sans` keeps the text face (large headlines, where mono spacing looks loose). */
export function Money({ cents, signed, sans, className = "" }: { cents: number; signed?: boolean; sans?: boolean; className?: string }) {
  const color = !signed ? "" : cents < 0 ? "text-loss" : "text-gain";
  return (
    <span className={`whitespace-nowrap tabular-nums ${sans ? "" : "font-mono tracking-tight"} ${color} ${className}`}>
      {signed && cents > 0 ? "+" : ""}{fmt(cents, getCurrency())}
    </span>
  );
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
      <span className="w-11 shrink-0 font-mono text-xs text-muted">{lead}</span>
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

const segment =
  "flex-1 cursor-pointer rounded-lg py-2 text-center text-sm font-medium text-muted transition-colors has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm";

/**
 * Form shared by quick add, subscriptions and planned expenses: type, amount and label first,
 * the rest has sensible defaults (first account, today).
 */
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
  const types = [["depense", "Dépense"], ["revenu", "Revenu"], ...(transfer && accounts.length > 1 ? [["virement", "Virement"]] : [])];
  return (
    // `group` + :has() swaps category for the destination account on transfers, without client JS.
    <form action={action} className="group space-y-3">
      <div role="radiogroup" aria-label="Type" className="flex gap-1 rounded-xl bg-paper p-1">
        {types.map(([value, label]) => (
          <label key={value} className={segment}>
            <input type="radio" name="type" value={value} defaultChecked={value === "depense"} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      <div className="flex items-baseline gap-2 border-b border-line focus-within:border-accent">
        <input
          name="amount" required inputMode="decimal" pattern="\d+([.,]\d{1,2})?" placeholder="0,00" aria-label="Montant"
          className="w-full bg-transparent py-2 font-mono text-4xl tracking-tight placeholder:text-muted/40 focus:outline-none"
        />
        <span className="font-mono text-xl text-muted">{getCurrency()}</span>
      </div>
      <input name="label" required maxLength={80} placeholder="Libellé (Courses, Loyer, Netflix…)" aria-label="Libellé" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Compte">
          <select name="account_id" className={input}>{options}</select>
        </Field>
        <Field label="Vers le compte" className="hidden group-has-[input[value=virement]:checked]:block">
          <select name="to_account_id" className={input} defaultValue={accounts[1]?.id}>{options}</select>
        </Field>
        <Field label="Catégorie" className="group-has-[input[value=virement]:checked]:hidden">
          <input name="category" list="categories" maxLength={40} placeholder="Facultatif" className={input} />
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        {when === "date" ? (
          <Field label="Date">
            <input name="date" type="date" required defaultValue={today} className={input} />
          </Field>
        ) : (
          <Field label="Chaque mois, le">
            <input name="day" type="number" min={1} max={31} required defaultValue={Number(today.slice(8))} className={input} />
          </Field>
        )}
      </div>
      <button className={`${button} w-full py-3`}>{submit}</button>
    </form>
  );
}
