"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/locale";
import { throttle } from "@/lib/mail";
import { periodLabel } from "@/lib/pdf";
import { cleanupStatements, createStatement, emailStatement } from "@/lib/reports";
import { periodOf, type Period } from "@/lib/statement";

type State = { error?: string; ok?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RETENTIONS = [3, 6, 12, 24];

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** A month, a Monday-to-Sunday week (both from any day in them) or a custom range of at most a year. */
function period(form: FormData): Period {
  const kind = field(form, "kind");
  if (kind === "month" || kind === "week") {
    const date = field(form, "date");
    if (!DATE.test(date)) throw new Error("err.period");
    return periodOf(kind, date);
  }
  const [start, end] = [field(form, "from"), field(form, "to")];
  const days = (Date.parse(end) - Date.parse(start)) / 864e5;
  if (kind !== "custom" || !DATE.test(start) || !DATE.test(end) || !(days >= 0 && days <= 366)) throw new Error("err.period");
  return { kind, start, end };
}

export async function generateStatement(_: State, form: FormData): Promise<State> {
  const { id } = await requireUser();
  const { t, te, intl, locale } = await getT();
  try {
    const p = period(form);
    await createStatement(id, p, locale);
    revalidatePath("/releves");
    return { ok: t("rel.created", { period: periodLabel(p, intl) }) };
  } catch (e) {
    return { error: te(e) };
  }
}

export async function saveReportSettings(_: State, form: FormData): Promise<State> {
  const { id } = await requireUser();
  const { t, te } = await getT();
  try {
    const frequency = field(form, "frequency");
    if (!["off", "weekly", "monthly"].includes(frequency)) throw new Error("Invalid frequency");
    const retention = Number(field(form, "retention")) || null;
    if (retention !== null && !RETENTIONS.includes(retention)) throw new Error("Invalid retention");
    db.prepare("UPDATE users SET report_frequency = ?, report_email = ?, statement_retention = ? WHERE id = ?")
      .run(frequency, form.get("report_email") ? 1 : 0, retention, id);
    cleanupStatements(id);
    revalidatePath("/releves");
    return { ok: t("rel.saved") };
  } catch (e) {
    return { error: te(e) };
  }
}

export async function sendStatement(_: State, form: FormData): Promise<State> {
  const { id } = await requireUser();
  const { t, te } = await getT();
  try {
    throttle(`user-${id}`);
    await emailStatement(id, Number(form.get("id")));
    const { email } = db.prepare("SELECT email FROM users WHERE id = ?").get(id) as { email: string };
    revalidatePath("/releves");
    return { ok: t("rel.sent", { email }) };
  } catch (e) {
    return { error: te(e) };
  }
}

export async function deleteStatement(form: FormData) {
  const { id } = await requireUser();
  db.prepare("DELETE FROM statements WHERE id = ? AND user_id = ?").run(Number(form.get("id")), id);
  revalidatePath("/releves");
}
