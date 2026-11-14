// OAuth 2.1 authorization server for the MCP endpoint, as the MCP spec describes it: discovery (RFC 9728, RFC 8414),
// dynamic client registration (RFC 7591), authorization code + PKCE S256 only, rotating refresh tokens.
// This is what Claude (claude.ai, Desktop, Code), ChatGPT and Codex do by default when given just the /mcp URL.
// Granted access tokens live in api_tokens like the static ones: same checks, listed and revocable in the settings.
import { createHash, randomBytes } from "node:crypto";
import { db, sha256 } from "./db.ts";
import type { Scope } from "./mcp.ts";

const ACCESS_TTL = 3600e3; // 1 h, then the client refreshes
const CODE_TTL = 5 * 60e3;
const MAX_CLIENTS = 200;
const rand = () => randomBytes(32).toString("base64url");

export const SCOPES = ["read", "write"] as const;

export const resourceMetadata = (origin: string) => ({
  resource: `${origin}/mcp`,
  authorization_servers: [origin],
  scopes_supported: SCOPES,
  bearer_methods_supported: ["header"],
  resource_name: "Economy",
});

export const serverMetadata = (origin: string) => ({
  issuer: origin,
  authorization_endpoint: `${origin}/oauth/authorize`,
  token_endpoint: `${origin}/oauth/token`,
  registration_endpoint: `${origin}/oauth/register`,
  scopes_supported: SCOPES,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  authorization_response_iss_parameter_supported: true,
});

/** https, http on loopback (desktop/CLI clients), or an app's own scheme (cursor://…). Never a fragment. */
export function isRedirectUri(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 500) return false;
  let u: URL;
  try { u = new URL(v); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return !["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"].includes(u.protocol);
}

export class OAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** RFC 7591. Public clients only: whatever auth method is asked, the answer is "none" (PKCE protects the code). */
export function registerClient(body: unknown) {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every(isRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris: 1 to 10 https, loopback http or app-scheme URIs");
  }
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : "MCP client";
  // Registration is open to anyone (the spec wants it): clients never authorized are dropped after a day.
  db.prepare("DELETE FROM oauth_clients WHERE created_at < ? AND id NOT IN (SELECT client_id FROM api_tokens WHERE client_id IS NOT NULL)").run(Date.now() - 864e5);
  if ((db.prepare("SELECT COUNT(*) AS n FROM oauth_clients").get() as { n: number }).n >= MAX_CLIENTS) {
    throw new OAuthError("temporarily_unavailable", "Too many registered clients, try again tomorrow");
  }
  const id = `eco_client_${randomBytes(16).toString("base64url")}`, now = Date.now();
  db.prepare("INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)").run(id, name, JSON.stringify(uris), now);
  return {
    client_id: id, client_id_issued_at: Math.floor(now / 1000), client_name: name, redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
  };
}

export type AuthRequest = { clientId: string; clientName: string; redirectUri: string; challenge: string; state: string | null; scope: Scope };

/** Checks the query of /oauth/authorize. Throws a readable message: the page shows it instead of redirecting. */
export function checkAuthorize(p: Record<string, string | undefined>, origin: string): AuthRequest {
  const client = db.prepare("SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ?").get(p.client_id ?? "") as
    | { id: string; name: string; redirect_uris: string }
    | undefined;
  if (!client) throw new Error("Unknown client_id: the client must register again.");
  const uris = JSON.parse(client.redirect_uris) as string[];
  const redirectUri = p.redirect_uri ?? (uris.length === 1 ? uris[0] : "");
  if (!uris.includes(redirectUri)) throw new Error("redirect_uri was not registered by this client.");
  if (p.response_type !== "code") throw new Error('response_type must be "code".');
  if (p.code_challenge_method !== "S256" || !/^[\w.~-]{43,128}$/.test(p.code_challenge ?? "")) throw new Error("PKCE with S256 is required.");
  const resource = p.resource?.replace(/\/$/, "");
  if (resource && resource !== `${origin}/mcp` && resource !== origin) throw new Error(`Unknown resource: ${resource}`);
  if (p.state && p.state.length > 1000) throw new Error("state is too long.");
  return {
    clientId: client.id, clientName: client.name, redirectUri, challenge: p.code_challenge!, state: p.state || null,
    scope: p.scope?.split(" ").includes("write") ? "write" : "read",
  };
}

/** Where the browser goes back to, with the code (or the refusal), the state and our issuer (RFC 9207). */
export function authorizeRedirect(req: AuthRequest, origin: string, uid: number | null, scope: Scope): string {
  const url = new URL(req.redirectUri);
  if (uid === null) {
    url.searchParams.set("error", "access_denied");
  } else {
    const code = rand();
    db.prepare("DELETE FROM oauth_codes WHERE expires_at < ?").run(Date.now());
    db.prepare("INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, challenge, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(sha256(code), req.clientId, uid, req.redirectUri, req.challenge, scope, Date.now() + CODE_TTL);
    url.searchParams.set("code", code);
  }
  if (req.state) url.searchParams.set("state", req.state);
  url.searchParams.set("iss", origin);
  return url.toString();
}

function issue(rowId: number) {
  const access = `eco_${rand()}`, refresh = `eco_r_${rand()}`;
  db.prepare("UPDATE api_tokens SET token_hash = ?, refresh_hash = ?, expires_at = ? WHERE id = ?").run(sha256(access), sha256(refresh), Date.now() + ACCESS_TTL, rowId);
  const { scope } = db.prepare("SELECT scope FROM api_tokens WHERE id = ?").get(rowId) as { scope: Scope };
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope };
}

/** Token endpoint (form fields). A client secret, if sent, is ignored: every client is public. */
export function exchange(f: Record<string, string | undefined>) {
  if (f.grant_type === "authorization_code") {
    const row = db.prepare("DELETE FROM oauth_codes WHERE code_hash = ? AND expires_at > ? RETURNING *").get(sha256(f.code ?? ""), Date.now()) as
      | { client_id: string; user_id: number; redirect_uri: string; challenge: string; scope: Scope }
      | undefined;
    if (!row || row.client_id !== f.client_id) throw new OAuthError("invalid_grant", "Unknown, used or expired code");
    if (f.redirect_uri !== undefined && f.redirect_uri !== row.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    const verifier = f.code_verifier ?? "";
    if (!/^[\w.~-]{43,128}$/.test(verifier) || createHash("sha256").update(verifier).digest("base64url") !== row.challenge) {
      throw new OAuthError("invalid_grant", "PKCE verification failed");
    }
    const { name } = db.prepare("SELECT name FROM oauth_clients WHERE id = ?").get(row.client_id) as { name: string };
    // Placeholder hash, replaced at once by issue(): token_hash is NOT NULL UNIQUE.
    const id = Number(db.prepare("INSERT INTO api_tokens (user_id, name, token_hash, scope, client_id) VALUES (?, ?, ?, ?, ?)")
      .run(row.user_id, name, sha256(rand()), row.scope, row.client_id).lastInsertRowid);
    return issue(id);
  }
  if (f.grant_type === "refresh_token") {
    const row = db.prepare("SELECT id, client_id FROM api_tokens WHERE refresh_hash = ?").get(sha256(f.refresh_token ?? "")) as
      | { id: number; client_id: string }
      | undefined;
    if (!row || row.client_id !== f.client_id) throw new OAuthError("invalid_grant", "Unknown or revoked refresh token");
    return issue(row.id); // rotation: the old refresh token stops working
  }
  throw new OAuthError("unsupported_grant_type", "authorization_code or refresh_token");
}

/** Where to go after signing in: back to a pending authorization, never anywhere else. */
export const safeNext = (v: unknown) => (typeof v === "string" && v.startsWith("/oauth/authorize?") ? v : "/");
