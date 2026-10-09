import { requireUser } from "@/lib/auth";
import { localToday } from "@/lib/forecast";
import { getT } from "@/lib/locale";
import { mailEnabled } from "@/lib/mail";
import { periodLabel } from "@/lib/pdf";
import { getReportSettings, getStatements } from "@/lib/reports";
import { ConfirmButton, MessageForm } from "../client";
import { Card, Empty, Field, PageHeader, button, input } from "../ui";
import { deleteStatement, generateStatement, saveReportSettings, sendStatement } from "./actions";

const segment =
  "flex-1 cursor-pointer rounded-lg py-2 text-center text-sm font-medium text-muted transition-colors has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm";
const iconButton = "grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink";
const svg = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export default async function Releves() {
  const user = await requireUser();
  const { t, intl } = await getT();
  const settings = getReportSettings(user.id);
  const statements = getStatements(user.id);
  const today = localToday();
  const kb = new Intl.NumberFormat(intl, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 });
  const created = (s: string) => new Date(`${s.replace(" ", "T")}Z`).toLocaleDateString(intl, { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <PageHeader title={t("rel.title")} sub={t("rel.sub")} />
      {/* Phone: create, list, settings. Desktop: the list on the left, both forms on the right. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="lg:col-start-2">
          <Card title={t("rel.new")}>
            {/* `group` + :has() switches between one date and a from/to range, without client JS. */}
            <MessageForm action={generateStatement} className="group space-y-3">
              <div role="radiogroup" className="flex gap-1 rounded-xl bg-paper p-1">
                {(["month", "week", "custom"] as const).map((k) => (
                  <label key={k} className={segment}>
                    <input type="radio" name="kind" value={k} defaultChecked={k === "month"} className="sr-only" />
                    {t(`rel.kind.${k}`)}
                  </label>
                ))}
              </div>
              <Field label={t("rel.containing")} className="group-has-[input[value=custom]:checked]:hidden">
                <input name="date" type="date" defaultValue={today} className={input} />
              </Field>
              <div className="hidden grid-cols-2 gap-3 group-has-[input[value=custom]:checked]:grid">
                <Field label={t("rel.from")}><input name="from" type="date" defaultValue={`${today.slice(0, 7)}-01`} className={input} /></Field>
                <Field label={t("rel.to")}><input name="to" type="date" defaultValue={today} className={input} /></Field>
              </div>
              <button className={`${button} w-full`}>{t("rel.generate")}</button>
            </MessageForm>
          </Card>
        </div>
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Card title={t("rel.list")}>
            {statements.length ? (
              <ul className="divide-y divide-line">
                {statements.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                    {/* The dark document tile echoes the header band of the PDF itself. */}
                    <a href={`/releves/${s.id}`} target="_blank" rel="noreferrer" aria-hidden tabIndex={-1}
                      className="grid h-12 w-10 shrink-0 place-items-center rounded-lg bg-bar text-bar-accent ring-1 ring-bar-line">
                      {svg("M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4")}
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2">
                        <a href={`/releves/${s.id}`} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
                          {periodLabel(s, intl)}
                        </a>
                        <span className="rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-medium text-muted">{t(`rel.badge.${s.kind}`)}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {t("rel.meta", { date: created(s.created_at), size: kb.format(Math.max(1, s.size / 1024)) })}
                        {s.emailed_at && <>, <span className="text-gain">{t("rel.emailed")}</span></>}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <a href={`/releves/${s.id}?download`} className={iconButton} aria-label={t("rel.download")} title={t("rel.download")}>
                        {svg("M12 4v11M7 10l5 5 5-5M5 20h14")}
                      </a>
                      {mailEnabled && settings.email && (
                        <MessageForm action={sendStatement} className="contents">
                          <input type="hidden" name="id" value={s.id} />
                          <button className={iconButton} aria-label={t("rel.send")} title={t("rel.send")}>
                            {svg("M4 6h16v12H4zM4 7l8 6 8-6")}
                          </button>
                        </MessageForm>
                      )}
                      <form action={deleteStatement}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton message={t("rel.deleteConfirm")} aria-label={t("common.delete")} title={t("common.delete")}
                          className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-loss/10 hover:text-loss">
                          {svg("M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13")}
                        </ConfirmButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty>{t("rel.empty")}</Empty>}
          </Card>
        </div>
        <div className="lg:col-start-2">
          <Card title={t("rel.auto")}>
            <p className="mb-4 text-sm text-muted">{t("rel.autoHelp")}</p>
            <MessageForm action={saveReportSettings} className="space-y-3">
              <Field label={t("rel.frequency")}>
                <select name="frequency" defaultValue={settings.report_frequency} className={input}>
                  {(["off", "weekly", "monthly"] as const).map((f) => <option key={f} value={f}>{t(`rel.freq.${f}`)}</option>)}
                </select>
              </Field>
              <Field label={t("rel.email")}>
                <input name="email" type="email" maxLength={254} defaultValue={settings.email ?? ""} autoComplete="email" placeholder="vous@exemple.fr" className={input} />
              </Field>
              <label className={`flex items-start gap-2.5 text-sm ${mailEnabled ? "" : "opacity-50"}`}>
                <input type="checkbox" name="report_email" defaultChecked={!!settings.report_email} disabled={!mailEnabled} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>{t("rel.emailToggle")}</span>
              </label>
              {!mailEnabled && <p className="text-xs text-muted">{t("rel.mailOff")}</p>}
              <Field label={t("rel.retention")}>
                <select name="retention" defaultValue={settings.statement_retention ?? ""} className={input}>
                  <option value="">{t("rel.keepAll")}</option>
                  {[3, 6, 12, 24].map((n) => <option key={n} value={n}>{t("rel.keepMonths", { n })}</option>)}
                </select>
              </Field>
              <button className={`${button} w-full`}>{t("common.save")}</button>
            </MessageForm>
          </Card>
        </div>
      </div>
    </>
  );
}
