import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "economy-mcp-"));
const { db } = await import("./db.ts");
const mcp = await import("./mcp.ts");

const user = (name: string) => Number(db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'x')").run(name).lastInsertRowid);
const account = (uid: number) => Number(db.prepare("INSERT INTO accounts (name, kind, user_id, initial_balance) VALUES ('Courant', 'courant', ?, 10000)").run(uid).lastInsertRowid);
const call = (c: { uid: number; scope: "read" | "write" }, name: string, args: object = {}) =>
  mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, c) as { result?: { isError?: boolean; content: { text: string }[] }; error?: { code: number } };

const alice = user("alice"), bob = user("bob");
const aliceAccount = account(alice);

test("HTTPS is required except on localhost, and Host/Origin must match", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.match(mcp.transportError("http://budget.example.com", h({ host: "budget.example.com" }))!, /HTTPS/);
  assert.equal(mcp.transportError("http://localhost:3000", h({ host: "localhost:3000" })), null);
  assert.equal(mcp.transportError("https://b.example.com", h({ host: "b.example.com", "x-forwarded-proto": "https" })), null);
  assert.match(mcp.transportError("https://b.example.com", h({ host: "b.example.com", "x-forwarded-proto": "http" }))!, /HTTPS/);
  assert.match(mcp.transportError("https://b.example.com", h({ host: "evil.test" }))!, /Host/);
  assert.match(mcp.transportError("https://b.example.com", h({ host: "b.example.com", origin: "https://evil.test" }))!, /origin/);
});

test("a token is found by its hash, never stored in clear", () => {
  const token = mcp.createToken(alice, "test", "read");
  assert.deepEqual(mcp.findToken(`Bearer ${token}`), { uid: alice, scope: "read" });
  assert.equal(mcp.findToken(`Bearer ${token}x`), null);
  assert.equal(mcp.findToken(null), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM api_tokens WHERE token_hash = ?").get(token)!.n, 0);
});

test("initialize negotiates, notifications get no answer, unknown methods fail", () => {
  const c = { uid: alice, scope: "read" } as const;
  const init = mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, c) as { result: { protocolVersion: string } };
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(mcp.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, c), null);
  assert.equal((mcp.handleMessage({ jsonrpc: "2.0", id: 2, method: "nope" }, c) as { error: { code: number } }).error.code, -32601);
  assert.equal((mcp.handleMessage([], c) as { error: { code: number } }).error.code, -32600);
});

test("a read token neither sees nor can call the write tools", () => {
  const names = (scope: "read" | "write") =>
    (mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { uid: alice, scope }) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.ok(!names("read").includes("add_transaction"));
  assert.ok(names("write").includes("add_transaction"));
  assert.equal(call({ uid: alice, scope: "read" }, "add_transaction", { account_id: aliceAccount, label: "x", amount: -1 }).error?.code, -32602);
});

test("add_transaction stores cents on the caller's own account only", () => {
  const w = { uid: alice, scope: "write" } as const;
  const r = call(w, "add_transaction", { account_id: aliceAccount, label: "Courses", amount: -12.5, date: "2026-11-02" });
  assert.equal(r.result?.isError, undefined);
  assert.equal(db.prepare("SELECT amount FROM transactions WHERE label = 'Courses'").get()!.amount, -1250);
  assert.equal(call({ uid: bob, scope: "write" }, "add_transaction", { account_id: aliceAccount, label: "x", amount: -1 }).result?.isError, true);
  assert.equal(call(w, "add_transaction", { account_id: aliceAccount, label: "x", amount: 1.234 }).result?.isError, true);
  assert.equal(call(w, "add_transaction", { account_id: aliceAccount, label: "x", amount: 0 }).result?.isError, true);
});

test("reads are scoped to the user", () => {
  const mine = JSON.parse(call({ uid: alice, scope: "read" }, "list_accounts").result!.content[0].text);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].balance, 87.5);
  assert.deepEqual(JSON.parse(call({ uid: bob, scope: "read" }, "list_accounts").result!.content[0].text), []);
  assert.equal(JSON.parse(call({ uid: bob, scope: "read" }, "list_transactions", { month: "2026-11" }).result!.content[0].text).length, 0);
});

test("can_afford simulates without recording, names the rule it would break and the first safe month", () => {
  const c = { uid: alice, scope: "read" } as const;
  db.prepare("UPDATE accounts SET min_balance = 5000 WHERE id = ?").run(aliceAccount); // balance is 87.50, floor 50.00
  db.prepare("INSERT INTO recurring (account_id, label, amount, day, last_posted) VALUES (?, 'Salaire', 200000, 1, ?)").run(aliceAccount, "2026-11");
  const ok = JSON.parse(call(c, "can_afford", { amount: 20 }).result!.content[0].text);
  assert.deepEqual(ok.breaks_rules, []); // 87.50 - 20 stays above the 50.00 floor
  const big = JSON.parse(call(c, "can_afford", { amount: 60 }).result!.content[0].text);
  assert.equal(big.breaks_rules[0].rule, "minimum_balance");
  assert.notEqual(big.earliest_month_without_breaking_a_rule, null); // the salary next month makes room
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM planned").get()!.n, 0);
  assert.equal(call(c, "can_afford", { amount: -5 }).result?.isError, true);
});

test("context reaches the assistant through initialize and get_context", () => {
  db.prepare("UPDATE users SET mcp_context = 'Je garde 1500 euros de côté' WHERE id = ?").run(alice);
  const init = mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { uid: alice, scope: "read" }) as { result: { instructions: string } };
  assert.match(init.result.instructions, /1500 euros/);
  assert.equal(JSON.parse(call({ uid: alice, scope: "read" }, "get_context").result!.content[0].text).user_context, "Je garde 1500 euros de côté");
  assert.doesNotMatch((mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { uid: bob, scope: "read" }) as { result: { instructions: string } }).result.instructions, /1500/);
});
