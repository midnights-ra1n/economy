import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "economy-oauth-"));
const { db } = await import("./db.ts");
const oauth = await import("./oauth.ts");
const { findToken } = await import("./mcp.ts");

const ORIGIN = "https://b.example.com";
const uid = Number(db.prepare("INSERT INTO users (username, password_hash) VALUES ('alice', 'x')").run().lastInsertRowid);
const verifier = "v".repeat(50), challenge = createHash("sha256").update(verifier).digest("base64url");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

const authorize = (clientId: string, extra: Record<string, string> = {}) =>
  oauth.checkAuthorize({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s1", resource: `${ORIGIN}/mcp`, ...extra }, ORIGIN);

test("redirect URIs: https, loopback http and app schemes only", () => {
  for (const ok of [REDIRECT, "http://127.0.0.1:1455/callback", "http://localhost/cb", "cursor://anysphere.cursor-retrieval/oauth/cb"]) assert.ok(oauth.isRedirectUri(ok), ok);
  for (const bad of ["http://evil.test/cb", "javascript:alert(1)", "https://x.test/#frag", "not a url", 1]) assert.ok(!oauth.isRedirectUri(bad), String(bad));
  assert.throws(() => oauth.registerClient({ redirect_uris: ["http://evil.test/cb"] }), /redirect_uris/);
});

test("full flow: register, consent, code + PKCE, token, refresh rotation, expiry", () => {
  const { client_id, token_endpoint_auth_method } = oauth.registerClient({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" });
  assert.equal(token_endpoint_auth_method, "none");
  const req = authorize(client_id, { scope: "read write" });
  assert.equal(req.scope, "write");
  const back = new URL(oauth.authorizeRedirect(req, ORIGIN, uid, "read")); // the user lowered it to read
  assert.equal(back.searchParams.get("state"), "s1");
  assert.equal(back.searchParams.get("iss"), ORIGIN);
  const code = back.searchParams.get("code")!;

  assert.throws(() => oauth.exchange({ grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: "w".repeat(50) }), /PKCE/);
  // A failed attempt burned the code: it is single use whatever happens.
  assert.throws(() => oauth.exchange({ grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: verifier }), /code/);

  const code2 = new URL(oauth.authorizeRedirect(req, ORIGIN, uid, "read")).searchParams.get("code")!;
  assert.throws(() => oauth.exchange({ grant_type: "authorization_code", code: code2, client_id: "other", code_verifier: verifier }), /code/);
  const code3 = new URL(oauth.authorizeRedirect(req, ORIGIN, uid, "read")).searchParams.get("code")!;
  const t = oauth.exchange({ grant_type: "authorization_code", code: code3, client_id, redirect_uri: REDIRECT, code_verifier: verifier });
  assert.equal(t.scope, "read");
  assert.deepEqual(findToken(`Bearer ${t.access_token}`), { uid, scope: "read" });

  const t2 = oauth.exchange({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id });
  assert.equal(findToken(`Bearer ${t.access_token}`), null);
  assert.deepEqual(findToken(`Bearer ${t2.access_token}`), { uid, scope: "read" });
  assert.throws(() => oauth.exchange({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id }), /refresh/);

  db.prepare("UPDATE api_tokens SET expires_at = 1 WHERE client_id = ?").run(client_id);
  assert.equal(findToken(`Bearer ${t2.access_token}`), null);
});

test("authorization requests are refused for unknown clients, URIs, resources and missing PKCE", () => {
  const { client_id } = oauth.registerClient({ redirect_uris: [REDIRECT] });
  assert.throws(() => authorize("nope"), /client_id/);
  assert.throws(() => authorize(client_id, { redirect_uri: "https://evil.test/cb" }), /redirect_uri/);
  assert.throws(() => authorize(client_id, { resource: "https://evil.test/mcp" }), /resource/);
  assert.throws(() => authorize(client_id, { code_challenge_method: "plain" }), /PKCE/);
  assert.equal(new URL(oauth.authorizeRedirect(authorize(client_id), ORIGIN, null, "read")).searchParams.get("error"), "access_denied");
});

test("after sign-in, only a pending authorization is a valid destination", () => {
  assert.equal(oauth.safeNext("/oauth/authorize?client_id=x"), "/oauth/authorize?client_id=x");
  for (const bad of ["https://evil.test", "//evil.test", "/reglages", null]) assert.equal(oauth.safeNext(bad), "/");
});
