import { ORIGIN, assertNotLocked, clearFailures, recordFailure } from "@/lib/auth";
import { findToken, handleMessage, transportError } from "@/lib/mcp";

const MAX_BODY = 64 * 1024;
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** MCP endpoint (Streamable HTTP, stateless): POST one JSON-RPC message with `Authorization: Bearer eco_…`. */
export async function POST(request: Request) {
  const refusal = transportError(ORIGIN, request.headers);
  if (refusal) return json({ error: refusal }, 403);
  // Same brute-force guard as the login form: 5 bad tokens lock the IP for 15 minutes.
  try { await assertNotLocked(); } catch { return json({ error: "Too many attempts, try again later." }, 429); }
  const auth = request.headers.get("authorization");
  const caller = findToken(auth);
  if (!caller) {
    // No token at all is how OAuth clients start (discovery), not an attack: only wrong tokens count.
    if (auth) await recordFailure();
    const challenge = `Bearer realm="economy", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"${auth ? ', error="invalid_token"' : ""}`;
    return json({ error: "Invalid or missing token." }, 401, { "WWW-Authenticate": challenge });
  }
  await clearFailures();
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
  let msg: unknown;
  try { msg = JSON.parse(raw); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  const reply = handleMessage(msg, caller);
  return reply ? json(reply) : new Response(null, { status: 202 });
}

// No server-initiated stream and no sessions: the spec allows answering 405.
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export { notAllowed as GET, notAllowed as DELETE };
