// Run: node --test lib/
import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, cumulativeSpending, dayInMonth, duePosts, forecast, parseCents, reminders } from "./forecast.ts";

test("months and clamped days", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(dayInMonth("2026-02", 31), "2026-02-28");
});

test("parseCents", () => {
  assert.equal(parseCents("12,5"), 1250);
  assert.equal(parseCents("1 200.99"), 120099);
  assert.equal(parseCents("0.1"), 10);
  assert.equal(parseCents("abc"), null);
  assert.equal(parseCents("1.234"), null);
});

test("duePosts catches up missed months and stops at today", () => {
  assert.deepEqual(duePosts({ day: 5, last_posted: "2026-08", every: 1 }, "2026-10-04"), ["2026-09-05"]);
  assert.deepEqual(duePosts({ day: 5, last_posted: "2026-08", every: 1 }, "2026-10-05"), ["2026-09-05", "2026-10-05"]);
  assert.deepEqual(duePosts({ day: 5, last_posted: "2026-10", every: 1 }, "2026-10-20"), []);
});

test("forecast applies future recurrences, transfers, planned and min-balance alerts", () => {
  const accounts = [
    { id: 1, name: "Courant", kind: "courant", balance: 100000, min_balance: 0 },
    { id: 2, name: "Livret", kind: "epargne", balance: 50000, min_balance: 45000 },
  ];
  const recurring = [
    { id: 1, label: "Netflix", amount: -1500, day: 20, account_id: 1, to_account_id: null, last_posted: "2026-10", every: 1, remind: null },
    { id: 2, label: "Salaire", amount: 200000, day: 1, account_id: 1, to_account_id: null, last_posted: "2026-10", every: 1, remind: null },
    { id: 3, label: "Retrait livret", amount: -3000, day: 15, account_id: 2, to_account_id: 1, last_posted: "2026-10", every: 1, remind: null },
  ];
  const planned = [
    { id: 1, label: "Pneus", amount: -40000, date: "2026-10-25", account_id: 1 },
    { id: 2, label: "Vacances", amount: -10000, date: "2026-11-10", account_id: 1 },
  ];
  const { months, alerts } = forecast(accounts, recurring, planned, "2026-10-10", 3);
  // October: Netflix (20th) + transfer (15th) + Pneus; salary (1st) already posted.
  assert.deepEqual(months[0].balances, { 1: 100000 - 1500 + 3000 - 40000, 2: 47000 });
  // November: everything + Vacances.
  assert.deepEqual(months[1].balances, { 1: 61500 - 1500 + 200000 + 3000 - 10000, 2: 44000 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].month, "2026-11");
});

test("cumulative spending ignores transfers, income and operations dated after today", () => {
  const tx = (date: string, amount: number, category: string | null = null) => ({ date, amount, category });
  // Today is the 3rd: the rent entered for the 28th must not turn the total into NaN.
  const curve = cumulativeSpending([tx("2026-10-01", -1000), tx("2026-10-02", 5000), tx("2026-10-03", -250), tx("2026-10-03", -3000, "Virement"), tx("2026-10-28", -80000)], 3);
  assert.deepEqual(curve, [1000, 1000, 1250]);
});

test("a recurrence every few months posts and forecasts only on its months", () => {
  const yearly = { day: 10, last_posted: "2025-11", every: 12 };
  assert.deepEqual(duePosts(yearly, "2026-10-28"), []);
  assert.deepEqual(duePosts(yearly, "2026-11-10"), ["2026-11-10"]);
  const accounts = [{ id: 1, name: "Courant", kind: "courant", balance: 0, min_balance: null }];
  const rec = [{ ...yearly, id: 1, label: "Assurance", amount: -12000, account_id: 1, to_account_id: null, remind: null }];
  const { months } = forecast(accounts, rec, [], "2026-10-28", 3);
  assert.deepEqual(months.map((m) => m.balances[1]), [0, -12000, -12000]);
});

test("reminders fire from their day until the due date, several per payment", () => {
  const r = { day: 5, last_posted: "2026-10", every: 1, remind: "7,1" };
  assert.deepEqual(reminders(r, "2026-10-28"), []);
  assert.deepEqual(reminders(r, "2026-10-29"), [{ due: "2026-11-05", days: 7 }]);
  assert.deepEqual(reminders(r, "2026-11-04"), [{ due: "2026-11-05", days: 7 }, { due: "2026-11-05", days: 1 }]);
  // Due today and already posted this morning: the same-day reminder still shows.
  assert.deepEqual(reminders({ ...r, remind: "0", last_posted: "2026-11" }, "2026-11-05"), [{ due: "2026-11-05", days: 0 }]);
  assert.deepEqual(reminders({ ...r, remind: null }, "2026-11-04"), []);
  // Across a month boundary, and clamped to the month's last day.
  assert.deepEqual(reminders({ day: 31, last_posted: "2027-01", every: 1, remind: "3" }, "2027-02-25"), [{ due: "2027-02-28", days: 3 }]);
});
