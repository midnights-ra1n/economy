import { ORIGIN, assertNotLocked, clearFailures, recordFailure } from "@/lib/auth";
import { transportError } from "@/lib/mcp";
import { OAuthError, exchange } from "@/lib/oauth";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });

/** Token endpoint: authorization code (+ PKCE) or refresh token, form-encoded as OAuth requires. */
export async function POST(request: Request) {
  const refusal = transportError(ORIGIN, request.headers);
  if (refusal) return json({ error: "invalid_request", error_description: refusal }, 403);
  try { await assertNotLocked(); } catch { return json({ error: "invalid_request", error_description: "Too many attempts, try again later." }, 429); }
  let fields: Record<string, string | undefined>;
  try {
    fields = Object.fromEntries([...(await request.formData())].map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  } catch {
    return json({ error: "invalid_request", error_description: "Expected application/x-www-form-urlencoded" }, 400);
  }
  try {
    const tokens = exchange(fields);
    await clearFailures();
    return json(tokens);
  } catch (e) {
    if (!(e instanceof OAuthError)) throw e;
    if (e.code === "invalid_grant") await recordFailure(); // guessing codes or refresh tokens locks the IP like a bad password
    return json({ error: e.code, error_description: e.message }, 400);
  }
}
