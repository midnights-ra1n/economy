import { test } from "node:test";
import assert from "node:assert/strict";
import { lastCompleted, periodOf, statementFigures } from "./statement.ts";

test("periods: calendar month and Monday-to-Sunday week", () => {
  assert.deepEqual(periodOf("month", "2026-02-14"), { kind: "month", start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(periodOf("week", "2026-10-09"), { kind: "week", start: "2026-10-05", end: "2026-10-11" }); // a Friday
  assert.deepEqual(periodOf("week", "2026-10-05"), { kind: "week", start: "2026-10-05", end: "2026-10-11" }); // the Monday
  assert.deepEqual(periodOf("week", "2026-11-01"), { kind: "week", start: "2026-10-26", end: "2026-11-01" }); // a Sunday
});

test("automatic statements cover the last period that is over", () => {
  assert.deepEqual(lastCompleted("monthly", "2026-01-01"), { kind: "month", start: "2025-12-01", end: "2025-12-31" });
  assert.deepEqual(lastCompleted("weekly", "2026-10-12"), { kind: "week", start: "2026-10-05", end: "2026-10-11" });
  assert.deepEqual(lastCompleted("weekly", "2026-10-11"), { kind: "week", start: "2026-09-28", end: "2026-10-04" });
});

test("figures: opening and closing balances, income and spending without transfers", () => {
  const accounts = [{ id: 1, name: "Courant", kind: "courant", initial_balance: 100000 }, { id: 2, name: "Livret", kind: "epargne", initial_balance: 0 }];
  const tx = (account_id: number, date: string, amount: number, category: string | null = null) => ({ account_id, date, label: "x", category, amount });
  const f = statementFigures(accounts, [
    tx(1, "2026-09-30", -5000),                 // before: only moves the opening balance
    tx(1, "2026-10-02", 200000, "Salaire"),
    tx(1, "2026-10-03", -4200, "Courses"),
    tx(1, "2026-10-05", -30000, "Virement"), tx(2, "2026-10-05", 30000, "Virement"),
    tx(1, "2026-11-01", -999),                  // after: ignored
  ], "2026-10-01", "2026-10-31");
  const [courant, livret] = f.accounts;
  assert.equal(courant.opening, 95000);
  assert.equal(courant.closing, 95000 + 200000 - 4200 - 30000);
  assert.deepEqual(courant.lines.map((l) => l.balance), [295000, 290800, 260800]);
  assert.equal(livret.closing, 30000);
  assert.deepEqual(f.totals, { opening: 95000, closing: 290800, income: 200000, expenses: 4200 });
  assert.deepEqual(f.categories, [["Courses", 4200]]);
});
