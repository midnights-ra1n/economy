import { ORIGIN } from "./auth";
import { OWN } from "./budget";
import { db, log } from "./db";
import { localToday } from "./forecast";
import { translator, type Key, type Locale } from "./i18n";
import { mailEnabled, sendMail, statementMail } from "./mail";
import { periodLabel, statementPdf, type StatementDoc } from "./pdf";
import { lastCompleted, periodOf, statementFigures, type Frequency, type Period } from "./statement";

type Owner = {
  id: number; username: string; currency: string; locale: Locale | null; email: string | null;
  report_frequency: Frequency; report_email: number; statement_retention: number | null;
};
export type StatementRow = { id: number; kind: Period["kind"]; start: string; end: string; created_at: string; emailed_at: string | null; size: number };

const owner = (uid: number) =>
  db.prepare("SELECT id, username, currency, locale, email, report_frequency, report_email, statement_retention FROM users WHERE id = ?").get(uid) as Owner;

export const getReportSettings = owner;

export const getStatements = (uid: number) =>
  db.prepare("SELECT id, kind, start, end, created_at, emailed_at, length(pdf) AS size FROM statements WHERE user_id = ? ORDER BY start DESC, id DESC")
    .all(uid) as StatementRow[];

/** Builds the statement from the user's data as it is now. */
function statementDoc(u: Owner, period: Period): StatementDoc {
  const accounts = db.prepare("SELECT id, name, kind, initial_balance FROM accounts WHERE user_id = ? ORDER BY kind, name").all(u.id) as {
    id: number; name: string; kind: string; initial_balance: number;
  }[];
  const txs = db.prepare(`SELECT account_id, date, label, category, amount FROM transactions WHERE ${OWN} AND date <= ? ORDER BY date, id`)
    .all(u.id, period.end) as Parameters<typeof statementFigures>[1];
  return { user: u.username, currency: u.currency, period, figures: statementFigures(accounts, txs, period.start, period.end), issued: new Date() };
}

/** Renders and stores a statement. A week or month generated again is replaced with fresh figures. */
export async function createStatement(uid: number, period: Period, locale?: Locale): Promise<number> {
  const u = owner(uid);
  const pdf = await statementPdf(statementDoc(u, period), translator(locale ?? u.locale ?? "fr"));
  const row = db.prepare(`
    INSERT INTO statements (user_id, kind, start, end, pdf) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, kind, start) WHERE kind != 'custom' DO UPDATE SET end = excluded.end, pdf = excluded.pdf, created_at = datetime('now')
    RETURNING id
  `).get(uid, period.kind, period.start, period.end, pdf) as { id: number };
  return row.id;
}

export function statementFile(uid: number, id: number, locale: Locale) {
  const s = db.prepare("SELECT kind, start, end, pdf FROM statements WHERE id = ? AND user_id = ?").get(id, uid) as
    | (Pick<StatementRow, "kind" | "start" | "end"> & { pdf: Uint8Array })
    | undefined;
  if (!s) return null;
  const range = s.kind === "month" ? s.start.slice(0, 7) : `${s.start}_${s.end}`;
  return { pdf: Buffer.from(s.pdf), filename: `${locale === "fr" ? "releve" : "statement"}-${range}.pdf`, period: s as Period };
}

/** E-mails a stored statement (summary in the body, PDF attached) to the user's address. */
export async function emailStatement(uid: number, id: number) {
  const u = owner(uid);
  if (!u.email) throw new Error("err.noEmail");
  const locale = u.locale ?? "fr";
  const file = statementFile(uid, id, locale);
  if (!file) throw new Error("err.notFound");
  const t = translator(locale);
  // The body's figures are recomputed; the attachment is the stored snapshot.
  const message = statementMail(statementDoc(u, file.period), t, `${ORIGIN}/releves`);
  await sendMail(u.email, message, [{ filename: file.filename, content: file.pdf }]);
  db.prepare("UPDATE statements SET emailed_at = datetime('now') WHERE id = ?").run(id);
}

/** Deletes statements older than the user's retention (in months, by end of period). */
export function cleanupStatements(uid?: number) {
  db.prepare(`
    DELETE FROM statements WHERE id IN (
      SELECT s.id FROM statements s JOIN users u ON u.id = s.user_id
      WHERE u.statement_retention IS NOT NULL AND s.end < date('now', '-' || u.statement_retention || ' months')
        AND (? IS NULL OR u.id = ?)
    )
  `).run(uid ?? null, uid ?? null);
}

/**
 * One pass of the scheduler: each user with automatic statements gets the last finished week or month,
 * e-mailed once if they asked for it (a failed send is retried on the next pass), then old ones are cleaned up.
 */
export async function runReports() {
  const users = db.prepare("SELECT id FROM users WHERE report_frequency != 'off'").all() as { id: number }[];
  for (const { id } of users) {
    const u = owner(id);
    try {
      const period = lastCompleted(u.report_frequency as "weekly" | "monthly", localToday());
      let s = db.prepare("SELECT id, emailed_at FROM statements WHERE user_id = ? AND kind = ? AND start = ?").get(id, period.kind, period.start) as
        | { id: number; emailed_at: string | null }
        | undefined;
      if (!s) {
        s = { id: await createStatement(id, period), emailed_at: null };
        log(`Statement ${periodLabel(period, "en-US")} created for user ${id}.`);
      }
      if (u.report_email && u.email && mailEnabled() && !s.emailed_at) await emailStatement(id, s.id);
    } catch (e) {
      log(`Statement for user ${id} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  cleanupStatements();
}

/** Runs the scheduler now and every hour (started once per server process). */
export function startReports() {
  const g = globalThis as unknown as { reports?: NodeJS.Timeout };
  if (g.reports) return;
  let running = false;
  const pass = async () => {
    if (running) return;
    running = true;
    await runReports().finally(() => (running = false));
  };
  void pass();
  g.reports = setInterval(pass, 3600e3);
  g.reports.unref();
}

/**
 * Test e-mail: a sample statement of the current month (demo figures, labelled "Example") rendered and
 * attached like a real one, so one click checks both SMTP and PDF generation.
 */
export async function sendTestEmail(to: string, user: { username: string; currency: string }, locale: Locale) {
  const tr = translator(locale);
  const { t } = tr;
  const period = periodOf("month", localToday());
  const day = (d: number) => `${period.start.slice(0, 8)}${String(d).padStart(2, "0")}`;
  const tx = (account_id: number, d: number, label: Key, category: Key | null, amount: number) =>
    ({ account_id, date: day(d), label: t(label), category: category && t(category), amount });
  const transfer = (n: number) => ({ ...tx(n, 5, "sample.savings", null, n === 1 ? -30000 : 30000), category: "Virement" });
  const figures = statementFigures(
    [{ id: 1, name: t("sample.checking"), kind: "courant", initial_balance: 152000 }, { id: 2, name: t("sample.savingsAccount"), kind: "epargne", initial_balance: 480000 }],
    [
      tx(1, 1, "sample.salary", "sample.income", 248000), tx(1, 2, "sample.rent", "sample.housing", -82000),
      tx(1, 3, "sample.groceries", "sample.food", -6450), transfer(1), transfer(2),
      tx(1, 8, "sample.streaming", "sample.leisure", -1399), tx(1, 12, "sample.groceries", "sample.food", -5120),
    ],
    period.start, period.end,
  );
  const doc = { user: user.username, currency: user.currency, period, figures, issued: new Date(), sample: true };
  const pdf = await statementPdf(doc, tr);
  await sendMail(to, statementMail(doc, tr, `${ORIGIN}/releves`), [{ filename: `${t("sample.file")}.pdf`, content: pdf }]);
}
