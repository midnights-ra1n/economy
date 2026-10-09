// Backup format (JSON, full restore) and CSV export of operations. Pure: tested with `node --test`.

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "JPY"] as const;

type Row = Record<string, unknown>;
export type Backup = {
  app: "economy";
  version: 1;
  currency: string;
  accounts: Row[];
  transactions: Row[];
  recurring: Row[];
  planned: Row[];
};

// Column checks per table: imported rows go straight into SQL, so every field is validated.
const int = (v: unknown) => Number.isSafeInteger(v);
const text = (max: number) => (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= max;
const optional = (check: (v: unknown) => boolean) => (v: unknown) => v === null || v === undefined || check(v);
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const month = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

export const SCHEMA = {
  accounts: { id: int, name: text(40), kind: (v: unknown) => v === "courant" || v === "epargne", initial_balance: int, min_balance: optional(int) },
  transactions: { id: int, account_id: int, label: text(80), amount: int, date, category: optional(text(40)) },
  recurring: {
    id: int, account_id: int, to_account_id: optional(int), label: text(80), amount: int,
    day: (v: unknown) => int(v) && (v as number) >= 1 && (v as number) <= 31, category: optional(text(40)), last_posted: month,
  },
  planned: { id: int, account_id: int, label: text(80), amount: int, date, category: optional(text(40)) },
} as const;

export function parseBackup(raw: string): Backup {
  let data: Row;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("err.notJson");
  }
  if (data?.app !== "economy" || data.version !== 1) throw new Error("err.notBackup");
  if (!CURRENCIES.includes(data.currency as never)) throw new Error("err.backupCurrency");
  for (const [table, columns] of Object.entries(SCHEMA)) {
    const rows = data[table];
    if (!Array.isArray(rows)) throw new Error(`err.backupSection|${table}`); // "key|detail": translated by te()
    rows.forEach((row, i) => {
      for (const [col, check] of Object.entries(columns)) {
        if (!check((row as Row)?.[col])) throw new Error(`err.backupValue|${table}[${i}].${col}`);
      }
    });
  }
  return data as Backup;
}

const csvCell = (v: string) => {
  // A leading = + - @ makes spreadsheets run the cell as a formula (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";,\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * BOM + the separators each spreadsheet locale expects: French Excel / LibreOffice want ";" and a decimal comma,
 * English ones "," and a decimal point.
 */
export function transactionsCsv(
  rows: { date: string; account: string; label: string; category: string | null; amount: number }[],
  locale: "fr" | "en" = "fr",
): string {
  const [sep, header] = locale === "fr" ? [";", "date;compte;libellé;catégorie;montant"] : [",", "date,account,description,category,amount"];
  const amount = (c: number) => (c / 100).toFixed(2).replace(".", locale === "fr" ? "," : ".");
  const lines = rows.map((r) => [r.date, csvCell(r.account), csvCell(r.label), csvCell(r.category ?? ""), amount(r.amount)].join(sep));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}
