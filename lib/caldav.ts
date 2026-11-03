import { ORIGIN } from "./auth";
import { getAccounts, getRecurring } from "./budget";
import { db, log, sha256 } from "./db";
import { fmt } from "./forecast";
import { translator, type Locale } from "./i18n";
import { icsEvent } from "./ics";
import { unseal } from "./secret";

// Subscriptions written to the user's CalDAV calendar (Nextcloud), one repeating event each with its reminders,
// so the calendar's own notifications (phone, Nextcloud, e-mail) remind of payments. Only what changed is sent again.

export type Conn = { url: string; user: string; pass: string };
type Owner = { caldav_url: string | null; caldav_user: string | null; caldav_pass: string | null; currency: string; locale: Locale | null };

/** https URL of a calendar collection, ending with "/" (event files go under it). Throws a dictionary key otherwise. */
export function calendarUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("err.caldavUrl");
  }
  // https only: the app password travels in every request.
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) throw new Error("err.caldavUrl");
  return u.href.endsWith("/") ? u.href : `${u.href}/`;
}

const href = (c: Conn, id: number) => `${c.url}economy-${id}.ics`;

/** One request to the calendar server. A missing event on DELETE is fine; redirects are refused (they would carry the password). */
export async function dav(c: Conn, method: string, url: string, body?: string, headers: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(url, {
      method, body, redirect: "manual", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Basic ${Buffer.from(`${c.user}:${c.pass}`).toString("base64")}`, ...(body && { "Content-Type": "text/calendar; charset=utf-8" }), ...headers },
    });
  } catch (e) {
    throw new Error(`err.caldavServer|${(e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name}`);
  }
  await res.arrayBuffer().catch(() => {}); // frees the connection
  if (res.status === 401 || res.status === 403) throw new Error("err.caldavAuth");
  if (res.status === 404 && method === "DELETE") return;
  if (res.status === 404) throw new Error("err.caldavNotFound");
  if (res.status >= 300) throw new Error(`err.caldavServer|${res.status}`);
}

/** Checks the address and credentials: the calendar must answer a PROPFIND. */
export const checkCalendar = (c: Conn) => dav(c, "PROPFIND", c.url, undefined, { Depth: "0" });

function connection(uid: number): (Conn & { owner: Owner }) | null {
  const o = db.prepare("SELECT caldav_url, caldav_user, caldav_pass, currency, locale FROM users WHERE id = ?").get(uid) as Owner | undefined;
  if (!o?.caldav_url) return null;
  const pass = o.caldav_pass && unseal(o.caldav_pass);
  if (!pass) throw new Error("err.caldavAuth"); // secret.key replaced: the password must be entered again
  return { url: o.caldav_url, user: o.caldav_user ?? "", pass, owner: o };
}

/**
 * Sends new and changed subscriptions, removes deleted ones. Records the time or the error (a dictionary key) for
 * the settings page; never throws, so it can run after a response or in the scheduler. Returns the error, if any.
 */
export async function syncCalendar(uid: number): Promise<string | null> {
  try {
    const c = connection(uid);
    if (!c) return null;
    const { t, intl } = translator(c.owner.locale ?? "fr");
    const names = Object.fromEntries(getAccounts(uid).map((a) => [a.id, a.bank && a.bank !== a.name ? `${a.name} (${a.bank})` : a.name]));
    const sent = new Map((db.prepare("SELECT recurring_id, hash FROM caldav_events WHERE user_id = ?").all(uid) as { recurring_id: number; hash: string }[])
      .map((r) => [r.recurring_id, r.hash]));
    const save = db.prepare("INSERT OR REPLACE INTO caldav_events (user_id, recurring_id, hash) VALUES (?, ?, ?)");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const host = new URL(ORIGIN).host;
    for (const r of getRecurring(uid)) {
      const fields = {
        uid: `economy-${r.id}@${host}`,
        summary: `${r.label} (${r.amount > 0 && !r.to_account_id ? "+" : ""}${fmt(r.amount, c.owner.currency, intl)})`,
        description: t("cal.desc", { account: names[r.account_id] ?? "" }),
      };
      const hash = sha256(icsEvent(r, { ...fields, stamp: "" }));
      if (sent.get(r.id) !== hash) {
        await dav(c, "PUT", href(c, r.id), icsEvent(r, { ...fields, stamp }));
        save.run(uid, r.id, hash);
      }
      sent.delete(r.id);
    }
    for (const id of sent.keys()) {
      await dav(c, "DELETE", href(c, id));
      db.prepare("DELETE FROM caldav_events WHERE user_id = ? AND recurring_id = ?").run(uid, id);
    }
    db.prepare("UPDATE users SET caldav_synced_at = datetime('now'), caldav_error = NULL WHERE id = ?").run(uid);
    return null;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    db.prepare("UPDATE users SET caldav_error = ? WHERE id = ?").run(error, uid);
    log(`Calendar sync for user ${uid} failed: ${error}`);
    return error;
  }
}

/** Removes the events this app wrote (best effort: the server may be gone) and forgets them. */
export async function clearCalendar(uid: number) {
  try {
    const c = connection(uid);
    const ids = db.prepare("SELECT recurring_id FROM caldav_events WHERE user_id = ?").all(uid) as { recurring_id: number }[];
    if (c) for (const { recurring_id } of ids) await dav(c, "DELETE", href(c, recurring_id));
  } catch (e) {
    log(`Calendar cleanup for user ${uid} failed: ${e instanceof Error ? e.message : e}`);
  }
  db.prepare("DELETE FROM caldav_events WHERE user_id = ?").run(uid);
}

/** Scheduler pass: every connected user (catches up after a server outage, and moves events to the latest payment). */
export async function syncCalendars() {
  for (const { id } of db.prepare("SELECT id FROM users WHERE caldav_url IS NOT NULL").all() as { id: number }[]) await syncCalendar(id);
}
