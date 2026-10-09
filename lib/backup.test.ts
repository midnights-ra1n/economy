import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBackup, transactionsCsv } from "./backup.ts";

const valid = {
  app: "economy", version: 1, currency: "USD",
  accounts: [{ id: 1, name: "Courant", kind: "courant", initial_balance: 1000, min_balance: null }],
  transactions: [{ id: 1, account_id: 1, label: "Café", amount: -250, date: "2026-10-01", category: null }],
  recurring: [{ id: 1, account_id: 1, to_account_id: null, label: "Netflix", amount: -1599, day: 5, category: "Loisirs", last_posted: "2026-10" }],
  planned: [],
};

test("parseBackup accepts a valid backup", () => {
  assert.equal(parseBackup(JSON.stringify(valid)).currency, "USD");
});

test("parseBackup rejects bad input", () => {
  assert.throws(() => parseBackup("not json"), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...valid, app: "other" })), /sauvegarde/);
  assert.throws(() => parseBackup(JSON.stringify({ ...valid, currency: "XXX" })), /Devise/);
  assert.throws(() => parseBackup(JSON.stringify({ ...valid, planned: undefined })), /planned/);
  const badAmount = { ...valid, transactions: [{ ...valid.transactions[0], amount: 1.5 }] };
  assert.throws(() => parseBackup(JSON.stringify(badAmount)), /transactions\[0\]\.amount/);
  const badDay = { ...valid, recurring: [{ ...valid.recurring[0], day: 32 }] };
  assert.throws(() => parseBackup(JSON.stringify(badDay)), /day/);
});

test("transactionsCsv escapes cells and blocks formula injection", () => {
  const csv = transactionsCsv([{ date: "2026-10-01", account: "Courant", label: '=HYPERLINK("x");1', category: null, amount: -1599 }]);
  assert.ok(csv.startsWith("﻿date;compte"));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"");1"`));
  assert.ok(csv.includes(";-15,99\r\n"));
});
