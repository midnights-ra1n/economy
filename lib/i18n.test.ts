import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLocale, translator } from "./i18n.ts";

test("language comes from the first supported Accept-Language entry, English otherwise", () => {
  assert.equal(pickLocale("fr-FR,fr;q=0.9,en;q=0.8"), "fr");
  assert.equal(pickLocale("de-DE,en;q=0.5,fr;q=0.3"), "en");
  assert.equal(pickLocale("de-DE"), "en");
  assert.equal(pickLocale(null), "en");
});

test("placeholders, plurals and translated errors", () => {
  const fr = translator("fr");
  const en = translator("en");
  assert.equal(fr.tn("adm.accounts", 0), "0 compte"); // French: 0 is singular
  assert.equal(en.tn("adm.accounts", 0), "0 accounts");
  assert.equal(en.tn("adm.accounts", 1), "1 account");
  assert.equal(en.t("ok.userCreated", { name: "alice" }), "alice can now sign in.");
  assert.equal(en.te(new Error("err.backupValue|transactions[0].amount")), "Invalid value: transactions[0].amount");
  assert.equal(fr.te(new Error("err.locked")), "Trop de tentatives, réessayez dans 15 minutes.");
  assert.equal(en.te(new Error("plain message")), "plain message");
});
