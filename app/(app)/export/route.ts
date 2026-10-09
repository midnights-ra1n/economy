import { isLoggedIn } from "@/lib/auth";
import { getCurrency } from "@/lib/budget";
import { db } from "@/lib/db";
import { transactionsCsv } from "@/lib/backup";
import { localToday } from "@/lib/forecast";

/** GET /export?format=json (full backup) | csv (operations, for spreadsheets). */
export async function GET(request: Request) {
  if (!(await isLoggedIn())) return new Response("Non autorisé", { status: 401 });
  const csv = new URL(request.url).searchParams.get("format") === "csv";
  const all = (table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  const body = csv
    ? transactionsCsv(
        db.prepare(`
          SELECT t.date, a.name AS account, t.label, t.category, t.amount
          FROM transactions t JOIN accounts a ON a.id = t.account_id ORDER BY t.date, t.id
        `).all() as Parameters<typeof transactionsCsv>[0],
      )
    : JSON.stringify(
        {
          app: "economy", version: 1, exported_at: new Date().toISOString(), currency: getCurrency(),
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
