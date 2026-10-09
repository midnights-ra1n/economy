import PDFDocument from "pdfkit";
import path from "node:path";
import { fmt } from "./forecast.ts";
import type { T } from "./i18n.ts";
import type { Figures, Period } from "./statement.ts";

// Same palette as the light theme of the web app (app/globals.css), so the PDF reads as part of it.
const C = {
  bar: "#141417", barInk: "#f2f2f3", barAccent: "#8b9dff",
  ink: "#1c1c1f", muted: "#6e6e76", line: "#e6e6ea", paper: "#f6f6f7", gain: "#1f9d5b", loss: "#d64545",
};
const W = 595.28; // A4, points
const H = 841.89;
const M = 48;
const CW = W - 2 * M;
const BOTTOM = H - 64; // above the footer

// Geist, as in the app. turbopackIgnore: runtime files (copied next to the server in Docker), not bundled.
const font = (file: string) => path.join(/*turbopackIgnore: true*/ process.cwd(), "assets/fonts", file);
const FONTS = { sans: "Geist-Regular.ttf", medium: "Geist-Medium.ttf", bold: "Geist-SemiBold.ttf", mono: "GeistMono-Regular.ttf", monoBold: "GeistMono-Medium.ttf" };

/** `sample`: demo figures of a test e-mail, labelled as such in the header. */
export type StatementDoc = { user: string; currency: string; period: Period; figures: Figures; issued: Date; sample?: boolean };

/** Human name of a period: "octobre 2026", "5–11 octobre 2026", "October 5 – 11, 2026"… */
export function periodLabel(period: Period, intl: string) {
  const d = (s: string) => new Date(`${s}T12:00:00`);
  if (period.kind === "month") {
    const s = d(period.start).toLocaleDateString(intl, { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric" }).formatRange(d(period.start), d(period.end));
}

/** The statement as an A4 PDF: dark header, summary strip, one ledger per account, spending by category. */
export function statementPdf(doc: StatementDoc, { t, intl }: Pick<T, "t" | "intl">): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: "A4", margin: 0, bufferPages: true, font: font(FONTS.sans),
    info: { Title: `${t("st.title")} — ${periodLabel(doc.period, intl)}`, Author: doc.user, Creator: "Economy", Producer: "Economy" },
  });
  for (const [name, file] of Object.entries(FONTS)) pdf.registerFont(name, font(file));
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));

  const money = (c: number, signed = false) => `${signed && c > 0 ? "+" : ""}${fmt(c, doc.currency, intl)}`;
  const date = (s: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) =>
    new Date(`${s}T12:00:00`).toLocaleDateString(intl, opts);
  const text = (s: string, x: number, y: number, o: { f?: keyof typeof FONTS; size?: number; color?: string; width?: number; align?: "left" | "right" | "center" } = {}) =>
    pdf.font(o.f ?? "sans").fontSize(o.size ?? 9.5).fillColor(o.color ?? C.ink)
      // Intl puts narrow/thin no-break spaces in French amounts; Geist only has the regular no-break space.
      .text(s.replace(/[\u202f\u2009]/g, "\u00a0"), x, y, { width: o.width, align: o.align, lineBreak: false, ellipsis: !!o.width });

  // Header band: the navbar's dark surface, with the app's mark.
  pdf.rect(0, 0, W, 168).fill(C.bar);
  pdf.save().translate(M, 40).scale(22 / 512);
  pdf.roundedRect(0, 0, 512, 512, 112).fillOpacity(0.14).fill("#ffffff").fillOpacity(1);
  pdf.path("M96 340c60 0 80-120 140-120s70 70 110 70 50-80 70-120").lineWidth(40).lineCap("round").lineJoin("round").stroke(C.barAccent);
  pdf.restore();
  text("Economy", M + 30, 44, { f: "bold", size: 12.5, color: C.barInk });
  text(t("st.title"), M, 45, { f: "medium", size: 10, color: C.barAccent, width: CW, align: "right" });
  if (doc.sample) text(t("st.sample"), M, 60, { size: 9, color: "#a3a3ab", width: CW, align: "right" });
  text(periodLabel(doc.period, intl), M, 86, { f: "bold", size: 28, color: C.barInk, width: CW });
  text(t("st.issued", { date: doc.issued.toLocaleDateString(intl, { day: "numeric", month: "long", year: "numeric" }), name: doc.user }), M, 128, {
    size: 9.5, color: "#a3a3ab", width: CW,
  });

  // Summary strip: four figures in one rounded panel divided by hairlines, like the dashboard's account grid.
  const { totals } = doc.figures;
  const cells: [string, string, string][] = [
    [t("st.opening"), money(totals.opening), C.ink],
    [t("st.income"), money(totals.income, true), C.gain],
    [t("st.expenses"), money(-totals.expenses, true), C.loss],
    [t("st.closing"), money(totals.closing), C.ink],
  ];
  let y = 192;
  pdf.roundedRect(M, y, CW, 62, 10).lineWidth(0.75).stroke(C.line);
  cells.forEach(([label, value, color], i) => {
    const x = M + (i * CW) / 4;
    if (i) pdf.moveTo(x, y).lineTo(x, y + 62).lineWidth(0.75).stroke(C.line);
    text(label, x + 14, y + 14, { size: 8.5, color: C.muted, width: CW / 4 - 28 });
    text(value, x + 14, y + 32, { f: i === 3 ? "monoBold" : "mono", size: 13, color, width: CW / 4 - 22 });
  });
  y += 62 + 34;

  const page = () => {
    pdf.addPage();
    y = M;
  };
  const room = (h: number) => {
    if (y + h > BOTTOM) page();
  };

  // One ledger per account: opening line, operations with running balance, closing line.
  const cols = { date: M, label: M + 54, amount: M + CW - 190, balance: M + CW - 90 };
  const head = () => {
    for (const [k, x, align] of [["st.date", cols.date, "left"], ["st.label", cols.label, "left"], ["st.amount", cols.amount, "right"], ["st.balance", cols.balance, "right"]] as const) {
      text(t(k), x, y, { size: 8, color: C.muted, width: align === "right" ? 90 : 200, align });
    }
    y += 14;
    pdf.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.75).stroke(C.ink);
    y += 4;
  };
  const row = (d: string, label: string, sub: string | null, amount: number | null, balance: number, strong = false) => {
    const h = sub ? 30 : 22;
    if (y + h > BOTTOM) {
      page();
      head();
    }
    text(d, cols.date, y + 7, { f: "mono", size: 8.5, color: C.muted });
    text(label, cols.label, y + 6, { f: strong ? "bold" : "sans", size: 9.5, width: cols.amount - cols.label - 110 });
    if (sub) text(sub, cols.label, y + 18, { size: 7.5, color: C.muted, width: cols.amount - cols.label - 110 });
    if (amount !== null) text(money(amount, true), cols.amount, y + 7, { f: "mono", size: 9, color: amount < 0 ? C.loss : C.gain, width: 90, align: "right" });
    text(money(balance), cols.balance, y + 7, { f: strong ? "monoBold" : "mono", size: 9, color: strong ? C.ink : C.muted, width: 90, align: "right" });
    y += h;
    pdf.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).stroke(C.line);
  };

  for (const a of doc.figures.accounts) {
    room(110);
    text(a.name, M, y, { f: "bold", size: 13, width: CW - 200 });
    text(t(a.kind === "courant" ? "acc.current" : "acc.savings"), M, y + 18, { size: 8.5, color: C.muted });
    text(`${money(a.opening)}  →  ${money(a.closing)}`, M + CW - 260, y + 3, { f: "mono", size: 10, color: C.muted, width: 260, align: "right" });
    y += 40;
    head();
    row(date(doc.period.start), t("st.opening"), null, null, a.opening);
    for (const l of a.lines) {
      const category = l.category === "Virement" ? t("entry.transfer") : l.category;
      row(date(l.date), l.label, category, l.amount, l.balance);
    }
    if (!a.lines.length) {
      room(24);
      text(t("st.noLines"), cols.label, y + 7, { size: 9, color: C.muted });
      y += 22;
    }
    row(date(doc.period.end), t("st.closing"), null, null, a.closing, true);
    y += 30;
  }

  // Spending by category: the same bars as the dashboard.
  if (doc.figures.categories.length) {
    room(60);
    text(t("st.categories"), M, y, { f: "bold", size: 13 });
    y += 28;
    const max = doc.figures.categories[0][1];
    for (const [name, v] of doc.figures.categories) {
      room(30);
      text(name ?? t("dash.uncategorized"), M, y, { size: 9.5, width: CW - 120 });
      text(money(v), M + CW - 120, y, { f: "mono", size: 9, width: 120, align: "right" });
      pdf.roundedRect(M, y + 15, CW, 4, 2).fill(C.paper);
      pdf.roundedRect(M, y + 15, Math.max(4, (v / max) * CW), 4, 2).fill(C.ink);
      y += 30;
    }
  }

  // Footer on every page.
  const { count } = pdf.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    pdf.switchToPage(i);
    pdf.moveTo(M, H - 44).lineTo(M + CW, H - 44).lineWidth(0.5).stroke(C.line);
    text(t("st.footer"), M, H - 34, { size: 7.5, color: C.muted, width: CW - 80 });
    text(t("st.page", { n: i + 1, total: count }), M + CW - 80, H - 34, { f: "mono", size: 7.5, color: C.muted, width: 80, align: "right" });
  }
  pdf.end();
  return done;
}
