import nodemailer from "nodemailer";
import { getSetting } from "./db";
import { unseal } from "./secret";
import { fmt } from "./forecast";
import type { T } from "./i18n";
import { periodLabel, type StatementDoc } from "./pdf";

// SMTP is set by an administrator in the admin panel and stored in the settings table; the password is
// encrypted (lib/secret.ts) and never sent back to the browser.
export type Security = "starttls" | "tls" | "none";
export type SmtpConfig = { host: string; port: number; security: Security; user: string; pass: string | null; from: string; fromName: string };

/** The saved SMTP settings, or null while sending is not set up (no server or no sender). */
export function smtpConfig(): SmtpConfig | null {
  const get = (k: string) => getSetting(`smtp_${k}`) ?? "";
  if (!get("host") || !get("from")) return null;
  const pass = get("pass");
  return {
    host: get("host"), port: Number(get("port")) || 587, security: (get("security") || "starttls") as Security,
    user: get("user"), pass: pass ? unseal(pass) : null, from: get("from"), fromName: get("from_name"),
  };
}

export const mailEnabled = () => smtpConfig() !== null;

export const isEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// shortcut: in-memory, per process; enough to stop a burst of e-mails from one account.
const lastSend = new Map<string, number>();
/** Throws when this key (a user) sent an e-mail less than 10 seconds ago. */
export function throttle(key: string) {
  if (Date.now() - (lastSend.get(key) ?? 0) < 10e3) throw new Error("err.wait");
  lastSend.set(key, Date.now());
}

function transporter(c: SmtpConfig) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.security === "tls", // 465
    requireTLS: c.security === "starttls", // 587: refuse to send in clear if the server does not offer TLS
    ignoreTLS: c.security === "none",
    auth: c.user ? { user: c.user, pass: c.pass ?? "" } : undefined,
    connectionTimeout: 15e3,
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sans = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const mono = "'Geist Mono',SFMono-Regular,Menlo,Consolas,monospace";

/** Statement e-mail: the PDF's dark header and summary, in table-based HTML that mail clients render. */
export function statementMail(doc: StatementDoc, { t, intl }: Pick<T, "t" | "intl">, link: string) {
  const money = (c: number, signed = false) => `${signed && c > 0 ? "+" : ""}${fmt(c, doc.currency, intl)}`;
  const period = periodLabel(doc.period, intl);
  const { totals, accounts } = doc.figures;
  const cell = (label: string, value: string, color: string) => `
    <td width="50%" style="padding:14px 16px;border:1px solid #e6e6ea;">
      <div style="font:13px ${sans};color:#6e6e76;">${esc(label)}</div>
      <div style="font:500 18px ${mono};color:${color};margin-top:4px;white-space:nowrap;">${esc(value)}</div>
    </td>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;padding:32px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6ea;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#141417;padding:28px 32px 30px;">
      <div style="font:600 14px ${sans};color:#f2f2f3;">Economy</div>
      <div style="font:500 13px ${sans};color:#8b9dff;margin-top:22px;">${esc(t("st.title"))}</div>
      <div style="font:600 28px ${sans};color:#f2f2f3;letter-spacing:-0.02em;margin-top:4px;">${esc(period)}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 8px;font:15px/1.5 ${sans};color:#1c1c1f;">
      ${esc(doc.sample ? t("mail.test") : t("mail.hello", { name: doc.user }))}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 8px;">
        <tr>${cell(t("st.opening"), money(totals.opening), "#1c1c1f")}${cell(t("st.closing"), money(totals.closing), "#1c1c1f")}</tr>
        <tr>${cell(t("st.income"), money(totals.income, true), "#1f9d5b")}${cell(t("st.expenses"), money(-totals.expenses, true), "#d64545")}</tr>
      </table>
    </td></tr>
    <tr><td style="padding:12px 32px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${accounts.map((a) => `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #e6e6ea;font:15px ${sans};color:#1c1c1f;">${esc(a.name)}</td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #e6e6ea;font:14px ${mono};color:#1c1c1f;white-space:nowrap;">${esc(money(a.closing))}</td>
        </tr>`).join("")}
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px 28px;font:14px/1.5 ${sans};color:#6e6e76;">${esc(t("mail.attached"))}</td></tr>
    <tr><td style="padding:18px 32px;border-top:1px solid #e6e6ea;background:#fafafb;font:12px/1.5 ${sans};color:#6e6e76;">
      ${esc(t(doc.sample ? "mail.whyTest" : "mail.why"))} <a href="${esc(link)}" style="color:#3e5bea;">${esc(t("mail.manage"))}</a>
    </td></tr>
  </table></td></tr></table></body></html>`;
  const text = [
    `${t("st.title")} — ${period}`, "",
    doc.sample ? t("mail.test") : t("mail.hello", { name: doc.user }), "",
    `${t("st.opening")}: ${money(totals.opening)}`, `${t("st.income")}: ${money(totals.income, true)}`,
    `${t("st.expenses")}: ${money(-totals.expenses, true)}`, `${t("st.closing")}: ${money(totals.closing)}`, "",
    ...accounts.map((a) => `${a.name}: ${money(a.closing)}`), "", t("mail.attached"), "", `${t(doc.sample ? "mail.whyTest" : "mail.why")} ${link}`,
  ].join("\n");
  return { subject: doc.sample ? t("mail.testSubject") : `${t("st.title")} — ${period}`, html, text };
}

export async function sendMail(to: string, message: { subject: string; html: string; text: string }, attachments: { filename: string; content: Buffer }[] = []) {
  const c = smtpConfig();
  if (!c) throw new Error("err.mailOff");
  await transporter(c).sendMail({
    from: c.fromName ? { name: c.fromName, address: c.from } : c.from,
    to, ...message,
    attachments: attachments.map((a) => ({ ...a, contentType: "application/pdf" })),
  });
}
