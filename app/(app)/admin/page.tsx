import { existsSync, statSync } from "node:fs";
import { requireAdmin } from "@/lib/auth";
import { db, dbPath, persistent } from "@/lib/db";
import { getT } from "@/lib/locale";
import { VERSION, latestRelease, updateCheckEnabled } from "@/lib/version";
import { isNewer } from "@/lib/semver";
import { ConfirmButton, MessageForm } from "../client";
import { Card, Field, button, input } from "../ui";
import { createUser, deleteUser, resetApp, resetPassword, revokeSessions, setRole, wipeUser } from "./actions";

type UserRow = {
  id: number; username: string; role: "admin" | "user"; created_at: string; last_login: string | null;
  accounts: number; operations: number; passkeys: number; sessions: number;
};

const ghost = "rounded-xl border border-line px-3 py-2 text-sm font-medium transition-colors hover:bg-paper";
const danger = "rounded-xl border border-loss/30 px-3 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss/10";

function size(bytes: number, intl: string) {
  const mb = bytes >= 1024 * 1024;
  return new Intl.NumberFormat(intl, { style: "unit", unit: mb ? "megabyte" : "kilobyte", maximumFractionDigits: mb ? 1 : 0 })
    .format(mb ? bytes / 1024 / 1024 : Math.max(1, bytes / 1024));
}

/** One hidden id + a confirmed button: the per-user actions that need no other input. */
function UserAction({ action, id, message, className, children }: {
  action: (f: FormData) => Promise<void>; id: number; message: string; className: string; children: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <ConfirmButton message={message} className={`${className} w-full`}>{children}</ConfirmButton>
    </form>
  );
}

export default async function Admin() {
  const me = await requireAdmin();
  const users = db.prepare(`
    SELECT u.id, u.username, u.role, u.created_at, u.last_login,
      (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS accounts,
      (SELECT COUNT(*) FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE a.user_id = u.id) AS operations,
      (SELECT COUNT(*) FROM credentials c WHERE c.user_id = u.id) AS passkeys,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > unixepoch() * 1000) AS sessions
    FROM users u ORDER BY u.role, u.username COLLATE NOCASE
  `).all() as UserRow[];
  const bytes = [dbPath, `${dbPath}-wal`].reduce((s, f) => s + (existsSync(f) ? statSync(f).size : 0), 0);
  const kept = persistent();
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  const { t, tn, rich, intl } = await getT();
  const latest = await latestRelease({ wait: true });
  const outdated = !!latest && isNewer(latest.version, VERSION);
  const day = (sqlite: string) => new Date(`${sqlite.replace(" ", "T")}Z`).toLocaleDateString(intl, { day: "numeric", month: "short", year: "numeric" });

  const stats = [
    { label: t("adm.users"), value: String(users.length), sub: tn("adm.admins", users.filter((u) => u.role === "admin").length) },
    { label: t("adm.operations"), value: users.reduce((s, u) => s + u.operations, 0).toLocaleString(intl), sub: tn("adm.accounts", users.reduce((s, u) => s + u.accounts, 0)) },
    { label: t("adm.database"), value: size(bytes, intl), sub: t("adm.schema", { v: user_version }) },
    { label: t("adm.storage"), value: t(kept ? "adm.persistent" : "adm.ephemeral"), sub: t(kept ? "adm.mounted" : "adm.mountHint"), warn: !kept },
  ];

  return (
    <>
      <section className="anim-rise space-y-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("adm.title")}</h1>
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          {stats.map((s) => (
            <li key={s.label} className="space-y-1 bg-surface p-4">
              <p className="text-sm text-muted">{s.label}</p>
              <p className={`text-lg font-medium ${s.warn ? "text-loss" : ""}`}>{s.value}</p>
              <p className="text-xs text-muted">{s.sub}</p>
            </li>
          ))}
        </ul>
      </section>

      <Card title={t("adm.users")}>
        <ul className="divide-y divide-line">
          {users.map((u) => {
            const self = u.id === me.id;
            return (
              <li key={u.id} className="py-3 first:pt-0 last:pb-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-paper font-medium uppercase">{u.username[0]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate font-medium">{u.username}</span>
                        {u.role === "admin" && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">{t("adm.badge")}</span>}
                        {self && <span className="text-xs text-muted">{t("adm.you")}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {[
                          tn("adm.accounts", u.accounts), tn("adm.ops", u.operations), tn("adm.passkeys", u.passkeys),
                          u.last_login ? t("adm.seen", { date: day(u.last_login) }) : t("adm.never"),
                        ].join(", ")}
                      </p>
                    </div>
                    <span className="text-sm text-muted transition-transform group-open:rotate-90" aria-hidden>›</span>
                  </summary>

                  <div className="mt-4 grid gap-5 rounded-xl bg-paper p-4 sm:grid-cols-2">
                    <p className="text-xs text-muted sm:col-span-2">
                      {t("adm.created", { date: day(u.created_at) })} {tn("adm.sessions", u.sessions)}.
                    </p>
                    {!self && (
                      <form action={setRole} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <Field label={t("adm.role")} className="flex-1">
                          <select name="role" defaultValue={u.role} className={input}>
                            <option value="user">{t("adm.roleUser")}</option>
                            <option value="admin">{t("adm.roleAdmin")}</option>
                          </select>
                        </Field>
                        <button className={ghost}>{t("adm.apply")}</button>
                      </form>
                    )}
                    {!self && (
                      <MessageForm action={resetPassword} className="space-y-2">
                        <input type="hidden" name="id" value={u.id} />
                        <Field label={t("adm.newPassword")}>
                          <input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} />
                        </Field>
                        <input name="confirm" type="password" required minLength={10} autoComplete="new-password" placeholder={t("adm.confirmPassword")} aria-label={t("login.confirm")} className={input} />
                        <button className={`${ghost} w-full`}>{t("set.changePassword")}</button>
                      </MessageForm>
                    )}
                    <div className="grid content-start gap-2 sm:col-span-2 sm:grid-cols-3">
                      {!self && (
                        <UserAction action={revokeSessions} id={u.id} message={t("adm.revokeConfirm", { name: u.username })} className={ghost}>
                          {t("adm.revoke")}
                        </UserAction>
                      )}
                      <UserAction
                        action={wipeUser} id={u.id} className={danger}
                        message={t("adm.wipeConfirm", { name: u.username })}
                      >
                        {t("adm.wipe")}
                      </UserAction>
                      {!self && (
                        <UserAction action={deleteUser} id={u.id} className={danger} message={t("adm.deleteConfirm", { name: u.username })}>
                          {t("adm.delete")}
                        </UserAction>
                      )}
                    </div>
                    {self && <p className="text-xs text-muted sm:col-span-2">{t("adm.selfNote")}</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={t("adm.version")}>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <p className="text-sm text-muted">{t("adm.versionInstalled")}</p>
            <p className="font-mono text-lg">{VERSION}</p>
          </div>
          {latest && (
            <div>
              <p className="text-sm text-muted">{t("adm.versionLatest")}</p>
              <a href={latest.url} target="_blank" rel="noreferrer" className="font-mono text-lg hover:underline">{latest.version}</a>
            </div>
          )}
          {updateCheckEnabled && (
            <p className={`rounded-lg px-2 py-1 text-sm font-medium ${outdated ? "bg-accent/10 text-accent" : latest ? "bg-gain/10 text-gain" : "bg-paper text-muted"}`}>
              {t(outdated ? "adm.updateAvailable" : latest ? "adm.upToDate" : "adm.updateUnknown")}
            </p>
          )}
        </div>
        <p className="mt-4 text-sm text-muted">
          {updateCheckEnabled
            ? rich("adm.updateHow", { cmd: <code className="rounded bg-paper px-1 py-0.5 font-mono text-xs text-ink">docker compose pull &amp;&amp; docker compose up -d</code> })
            : t("adm.updateOff")}
        </p>
      </Card>

      <Card title={t("adm.newUser")}>
        <p className="mb-4 text-sm text-muted">{t("adm.newUserHelp")}</p>
        <MessageForm action={createUser} className="grid gap-3 sm:grid-cols-2">
          <Field label={t("adm.username")}><input name="username" required maxLength={40} autoComplete="off" className={input} /></Field>
          <Field label={t("adm.role")}>
            <select name="role" defaultValue="user" className={input}>
              <option value="user">{t("adm.roleUser")}</option>
              <option value="admin">{t("adm.roleAdmin")}</option>
            </select>
          </Field>
          <Field label={t("adm.password")}><input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <Field label={t("adm.confirmPassword")}><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <button className={`${button} sm:col-span-2`}>{t("adm.createUser")}</button>
        </MessageForm>
      </Card>

      <Card title={t("adm.reset")}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {rich("adm.resetHelp", { strong: <strong className="font-medium text-ink">{t("adm.resetStrong")}</strong> })}
          </p>
          <MessageForm action={resetApp} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label={t("adm.typeWord", { word: t("adm.resetWord") })}><input name="confirm_text" required autoComplete="off" className={input} /></Field>
            <Field label={t("adm.yourPassword")}><input name="admin_password" type="password" required autoComplete="current-password" className={input} /></Field>
            <button className="rounded-xl bg-loss px-4 py-2.5 font-medium text-white transition-transform active:scale-[0.97]">{t("adm.resetButton")}</button>
          </MessageForm>
        </div>
      </Card>
    </>
  );
}
