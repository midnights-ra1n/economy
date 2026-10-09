import { test } from "node:test";
import assert from "node:assert/strict";
import { periodLabel, statementPdf } from "./pdf.ts";
import { translator } from "./i18n.ts";
import { statementFigures, periodOf } from "./statement.ts";

test("period labels", () => {
  assert.equal(periodLabel(periodOf("month", "2026-10-09"), "fr-FR"), "Octobre 2026");
  assert.match(periodLabel(periodOf("week", "2026-10-09"), "en-US"), /^October 5\s*–\s*11, 2026$/);
});

test("a long statement renders as a multi-page PDF with the Geist fonts", async () => {
  const txs = Array.from({ length: 60 }, (_, i) => ({ account_id: 1, date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, label: `Opération ${i}`, category: i % 2 ? "Courses" : null, amount: -1000 - i }));
  const period = periodOf("month", "2026-10-01");
  const figures = statementFigures([{ id: 1, name: "Courant", kind: "courant", initial_balance: 500000 }], txs, period.start, period.end);
  const pdf = await statementPdf({ user: "moi", currency: "EUR", period, figures, issued: new Date() }, translator("fr"));
  const raw = pdf.toString("latin1");
  assert.equal(raw.slice(0, 5), "%PDF-");
  assert.ok((raw.match(/\/Type \/Page\b/g) ?? []).length >= 2, "several pages");
  assert.match(raw, /Geist/, "embedded Geist font");
});
