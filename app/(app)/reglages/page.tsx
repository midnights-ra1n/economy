import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/backup";
import { db } from "@/lib/db";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { VERSION } from "@/lib/version";
import Link from "next/link";
import { changePassword, deletePasskey, logout } from "../../login/actions";
import { AddPasskeyForm } from "../../login/passkey-forms";
import { importData, savePreferences, wipeMyData } from "../actions";
import { ConfirmButton, MessageForm } from "../client";
import { Card, Field, button, input, listClass } from "../ui";

const ghost = "rounded-xl border border-line px-4 py-2.5 text-center font-medium transition-colors hover:bg-paper";

/** "Euro (€)", "US dollar ($)"… in the interface language. */
function currencyName(code: string, intl: string) {
  const name = new Intl.DisplayNames([intl], { type: "currency" }).of(code) ?? code;
  const symbol = new Intl.NumberFormat(intl, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
    .formatToParts(0).find((p) => p.type === "currency")?.value;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}${symbol && symbol !== code ? ` (${symbol})` : ""}`;
}

export default async function Reglages() {
  const user = await requireUser();
  const passkeys = db.prepare("SELECT id, name, created_at FROM credentials WHERE user_id = ? ORDER BY created_at").all(user.id) as {
    id: string; name: string; created_at: string;
  }[];
  const { t, rich, intl, locale } = await getT();
  return (
    <>
      <section className="anim-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("set.title")}</h1>
          <p className="mt-1 text-muted">
            {rich(user.role === "admin" ? "set.signedInAsAdmin" : "set.signedInAs", { name: <span className="font-medium text-ink">{user.username}</span> })}
          </p>
        </div>
        {user.role === "admin" && <Link href="/admin" className={ghost}>{t("set.adminLink")}</Link>}
      </section>

      <Card title={t("set.preferences")}>
        <form action={savePreferences} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t("set.language")}>
            <select name="locale" defaultValue={locale} className={input}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </select>
          </Field>
          <Field label={t("set.currency")}>
            <select name="currency" defaultValue={user.currency} className={input}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{currencyName(c, intl)}</option>)}
            </select>
          </Field>
          <button className={button}>{t("common.save")}</button>
        </form>
        <p className="mt-3 text-sm text-muted">{t("set.currencyHelp")}</p>
      </Card>

      <Card title={t("set.password")}>
        <MessageForm action={changePassword} className="grid gap-3 sm:grid-cols-3">
          <Field label={t("set.currentPassword")}><input name="current" type="password" required autoComplete="current-password" className={input} /></Field>
          <Field label={t("set.newPassword")}><input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <Field label={t("set.confirm")}><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <button className={`${button} sm:col-start-3`}>{t("set.changePassword")}</button>
        </MessageForm>
      </Card>

      <Card title={t("set.passkeys")}>
        <p className="mb-3 text-sm text-muted">{t("set.passkeysHelp")}</p>
        {passkeys.length > 0 && (
          <ul className={`mb-4 ${listClass}`}>
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                <div>
                  <p>{p.name}</p>
                  <p className="text-xs text-muted">{t("set.passkeyAdded", { date: new Date(`${p.created_at.replace(" ", "T")}Z`).toLocaleDateString(intl) })}</p>
                </div>
                <form action={deletePasskey}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton message={t("set.passkeyDelete")} className="text-sm text-loss hover:underline">{t("common.delete")}</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddPasskeyForm />
      </Card>

      <Card title={t("set.data")}>
        <p className="mb-3 text-sm text-muted">{t("set.dataHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href="/export?format=json" className={ghost} download>{t("set.exportJson")}</a>
          <a href="/export?format=csv" className={ghost} download>{t("set.exportCsv")}</a>
        </div>
        <MessageForm action={importData} className="mt-5 space-y-3 border-t border-line pt-5">
          <Field label={t("set.restore")}>
            <input name="file" type="file" accept="application/json,.json" required className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-1 file:text-paper`} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-1 accent-[var(--loss)]" />
            <span>{t("set.restoreAck")}</span>
          </label>
          <button className={button}>{t("set.import")}</button>
        </MessageForm>
      </Card>

      <Card title={t("set.wipe")}>
        <p className="mb-3 text-sm text-muted">{t("set.wipeHelp")}</p>
        <MessageForm action={wipeMyData} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t("set.wipePassword")} className="flex-1">
            <input name="password" type="password" required autoComplete="current-password" className={input} />
          </Field>
          <button className="rounded-xl border border-loss/30 px-4 py-2.5 font-medium text-loss transition-colors hover:bg-loss/10">{t("set.wipeButton")}</button>
        </MessageForm>
      </Card>

      <form action={logout}>
        <button className={`${ghost} w-full`}>{t("set.logout")}</button>
      </form>
      <p className="text-center font-mono text-xs text-muted">{t("set.version", { v: VERSION })}</p>
    </>
  );
}
