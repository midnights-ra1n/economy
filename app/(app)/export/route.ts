import { currentUser } from "@/lib/auth";
import { OWN } from "@/lib/budget";
import { db } from "@/lib/db";
import { SCHEMA, transactionsCsv } from "@/lib/backup";
import { localToday } from "@/lib/forecast";
import { getLocale } from "@/lib/locale";

/** GET /export?format=json (full backup) | csv (operations, for spreadsheets). */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const csv = new URL(request.url).searchParams.get("format") === "csv";
  // Only the caller's own rows; user_id stays out of the file (a backup can be restored into any account).
  const all = (table: keyof typeof SCHEMA) =>
    db.prepare(`SELECT ${Object.keys(SCHEMA[table]).join(", ")} FROM ${table} WHERE ${table === "accounts" ? "user_id = ?" : OWN} ORDER BY id`).all(user.id);
  const body = csv
    ? transactionsCsv(
        db.prepare(`
          SELECT t.date, a.name AS account, t.label, t.category, t.amount
          FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE a.user_id = ? ORDER BY t.date, t.id
        `).all(user.id) as Parameters<typeof transactionsCsv>[0],
        await getLocale(),
      )
    : JSON.stringify(
        {
          app: "economy", version: 1, exported_at: new Date().toISOString(), currency: user.currency,
          accounts: all("accounts"), transactions: all("transactions"), recurring: all("recurring"), planned: all("planned"),
        },
        null,
        2,
      );
  return new Response(body, {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json",
      "Content-Disposition": `attachment; filename="economy-${localToday()}.${csv ? "csv" : "json"}"`,
      "Cache-Control": "no-store",
    },
  });
}
