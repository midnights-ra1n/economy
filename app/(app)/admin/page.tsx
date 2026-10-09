import { existsSync, statSync } from "node:fs";
import { requireAdmin } from "@/lib/auth";
import { db, dbPath, persistent } from "@/lib/db";
import { ConfirmButton, MessageForm } from "../client";
import { Card, Field, button, input } from "../ui";
import { createUser, deleteUser, resetApp, resetPassword, revokeSessions, setRole, wipeUser } from "./actions";

type UserRow = {
  id: number; username: string; role: "admin" | "user"; created_at: string; last_login: string | null;
  accounts: number; operations: number; passkeys: number; sessions: number;
};

const ghost = "rounded-xl border border-line px-3 py-2 text-sm font-medium transition-colors hover:bg-paper";
const danger = "rounded-xl border border-loss/30 px-3 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss/10";
const day = (sqlite: string) => new Date(`${sqlite.replace(" ", "T")}Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
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

  const stats = [
    { label: "Utilisateurs", value: String(users.length), sub: plural(users.filter((u) => u.role === "admin").length, "admin") },
    { label: "Opérations", value: users.reduce((s, u) => s + u.operations, 0).toLocaleString("fr-FR"), sub: plural(users.reduce((s, u) => s + u.accounts, 0), "compte") },
    { label: "Base de données", value: size(bytes), sub: `schéma v${user_version}` },
    { label: "Stockage", value: kept ? "Persistant" : "Éphémère", sub: kept ? "volume monté" : "montez un volume sur /data", warn: !kept },
  ];

  return (
    <>
      <section className="anim-rise space-y-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Administration</h1>
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

      <Card title="Utilisateurs">
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
                        {u.role === "admin" && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">Admin</span>}
                        {self && <span className="text-xs text-muted">vous</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {plural(u.accounts, "compte")}, {plural(u.operations, "opération")}, {plural(u.passkeys, "passkey")},{" "}
                        {u.last_login ? `vu le ${day(u.last_login)}` : "jamais connecté"}
                      </p>
                    </div>
                    <span className="text-sm text-muted transition-transform group-open:rotate-90" aria-hidden>›</span>
                  </summary>

                  <div className="mt-4 grid gap-5 rounded-xl bg-paper p-4 sm:grid-cols-2">
                    <p className="text-xs text-muted sm:col-span-2">
                      Créé le {day(u.created_at)}. {plural(u.sessions, "session active")}.
                    </p>
                    {!self && (
                      <form action={setRole} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <Field label="Rôle" className="flex-1">
                          <select name="role" defaultValue={u.role} className={input}>
                            <option value="user">Utilisateur</option>
                            <option value="admin">Administrateur</option>
                          </select>
                        </Field>
                        <button className={ghost}>Appliquer</button>
                      </form>
                    )}
                    {!self && (
                      <MessageForm action={resetPassword} className="space-y-2">
                        <input type="hidden" name="id" value={u.id} />
                        <Field label="Nouveau mot de passe">
                          <input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} />
                        </Field>
                        <input name="confirm" type="password" required minLength={10} autoComplete="new-password" placeholder="Confirmer" aria-label="Confirmer le mot de passe" className={input} />
                        <button className={`${ghost} w-full`}>Changer le mot de passe</button>
                      </MessageForm>
                    )}
                    <div className="grid content-start gap-2 sm:col-span-2 sm:grid-cols-3">
                      {!self && (
                        <UserAction action={revokeSessions} id={u.id} message={`Déconnecter ${u.username} de tous ses appareils ?`} className={ghost}>
                          Déconnecter partout
                        </UserAction>
                      )}
                      <UserAction
                        action={wipeUser} id={u.id} className={danger}
                        message={`Effacer tous les comptes, opérations et prévisions de ${u.username} ? Son accès est conservé. Action irréversible.`}
                      >
                        Effacer les données bancaires
                      </UserAction>
                      {!self && (
                        <UserAction action={deleteUser} id={u.id} className={danger} message={`Supprimer ${u.username} et toutes ses données ? Action irréversible.`}>
                          Supprimer l&apos;utilisateur
                        </UserAction>
                      )}
                    </div>
                    {self && <p className="text-xs text-muted sm:col-span-2">Votre rôle et votre mot de passe se gèrent depuis Réglages ; un autre administrateur peut vous retirer vos droits.</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Nouvel utilisateur">
        <p className="mb-4 text-sm text-muted">Chaque utilisateur a ses propres comptes et ne voit pas ceux des autres. Transmettez-lui son mot de passe : il pourra le changer dans Réglages.</p>
        <MessageForm action={createUser} className="grid gap-3 sm:grid-cols-2">
          <Field label="Identifiant"><input name="username" required maxLength={40} autoComplete="off" className={input} /></Field>
          <Field label="Rôle">
            <select name="role" defaultValue="user" className={input}>
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </Field>
          <Field label="Mot de passe"><input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <Field label="Confirmer"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <button className={`${button} sm:col-span-2`}>Créer l&apos;utilisateur</button>
        </MessageForm>
      </Card>

      <Card title="Réinitialiser l'application">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Supprime <strong className="font-medium text-ink">tous les utilisateurs et toutes les données</strong>, comme à la première installation.
            Un nouveau code d&apos;initialisation s&apos;affichera dans les logs du serveur. Pensez à exporter vos données avant.
          </p>
          <MessageForm action={resetApp} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Tapez RÉINITIALISER"><input name="confirm_text" required autoComplete="off" className={input} /></Field>
            <Field label="Votre mot de passe"><input name="admin_password" type="password" required autoComplete="current-password" className={input} /></Field>
            <button className="rounded-xl bg-loss px-4 py-2.5 font-medium text-white transition-transform active:scale-[0.97]">Tout effacer</button>
          </MessageForm>
        </div>
      </Card>
    </>
  );
}
