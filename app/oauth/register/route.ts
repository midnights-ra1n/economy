import { ORIGIN } from "@/lib/auth";
import { transportError } from "@/lib/mcp";
import { OAuthError, registerClient } from "@/lib/oauth";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** RFC 7591 dynamic client registration: Claude, ChatGPT and Codex register themselves before asking for access. */
export async function POST(request: Request) {
  const refusal = transportError(ORIGIN, request.headers);
  if (refusal) return json({ error: "invalid_request", error_description: refusal }, 403);
  const raw = await request.text();
  if (raw.length > 16 * 1024) return json({ error: "invalid_client_metadata", error_description: "Too large" }, 413);
  try {
    return json(registerClient(JSON.parse(raw)), 201);
  } catch (e) {
    const code = e instanceof OAuthError ? e.code : "invalid_client_metadata";
    return json({ error: code, error_description: e instanceof Error ? e.message : "Invalid JSON" }, code === "temporarily_unavailable" ? 503 : 400);
  }
}
