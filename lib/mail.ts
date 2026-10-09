import nodemailer, { type Transporter } from "nodemailer";
import { fmt } from "./forecast";
import type { T } from "./i18n";
import { periodLabel, type StatementDoc } from "./pdf";

// SMTP comes from the environment (like any secret: never stored in the database).
const HOST = process.env.SMTP_HOST;
const FROM = process.env.SMTP_FROM;
export const mailEnabled = !!(HOST && FROM);
export const mailHost = HOST ?? null;

let transport: Transporter | null = null;
function transporter() {
  const port = Number(process.env.SMTP_PORT) || 587;
  return (transport ??= nodemailer.createTransport({
    host: HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465, // 587: STARTTLS
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  }));
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
      ${esc(t("mail.hello", { name: doc.user }))}
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
      ${esc(t("mail.why"))} <a href="${esc(link)}" style="color:#3e5bea;">${esc(t("mail.manage"))}</a>
    </td></tr>
  </table></td></tr></table></body></html>`;
  const text = [
    `${t("st.title")} — ${period}`, "",
    t("mail.hello", { name: doc.user }), "",
    `${t("st.opening")}: ${money(totals.opening)}`, `${t("st.income")}: ${money(totals.income, true)}`,
    `${t("st.expenses")}: ${money(-totals.expenses, true)}`, `${t("st.closing")}: ${money(totals.closing)}`, "",
    ...accounts.map((a) => `${a.name}: ${money(a.closing)}`), "", t("mail.attached"), "", `${t("mail.why")} ${link}`,
  ].join("\n");
  return { subject: `${t("st.title")} — ${period}`, html, text };
}

export async function sendMail(to: string, message: { subject: string; html: string; text: string }, attachments: { filename: string; content: Buffer }[] = []) {
  if (!mailEnabled) throw new Error("err.mailOff");
  await transporter().sendMail({ from: FROM, to, ...message, attachments: attachments.map((a) => ({ ...a, contentType: "application/pdf" })) });
}
