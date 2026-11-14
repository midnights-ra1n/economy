import { redirect } from "next/navigation";
import { ORIGIN, currentUser } from "@/lib/auth";
import { checkAuthorize, type AuthRequest } from "@/lib/oauth";
import { getT } from "@/lib/locale";
import { decide } from "./actions";

const KEYS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"];
const btn = "w-full rounded-xl px-4 py-3 font-medium transition-transform active:scale-[0.98]";

/** Consent screen an MCP client (Claude, ChatGPT, Codex…) opens in the browser to get access to the budget. */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const sp = await searchParams;
  const params = Object.fromEntries(KEYS.flatMap((k) => (typeof sp[k] === "string" ? [[k, sp[k] as string]] : [])));
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(params)}`)}`);
  const { t } = await getT();
  let req: AuthRequest | null = null, problem = "";
  try { req = checkAuthorize(params, ORIGIN); } catch (e) { problem = e instanceof Error ? e.message : String(e); }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="anim-rise space-y-2">
        <p className="text-lg font-semibold tracking-tight">Economy</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{req ? t("oauth.title", { client: req.clientName }) : t("oauth.invalid")}</h1>
        {req ? (
          <p className="text-muted">{t("oauth.text", { user: user.username, host: new URL(req.redirectUri).host || req.redirectUri })}</p>
        ) : (
          <p className="break-words font-mono text-sm text-muted">{problem}</p>
        )}
      </div>
      {req && (
        <form action={decide} className="space-y-4">
          {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm text-muted">{t("set.mcpScope")}</legend>
            {(["read", "write"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 rounded-xl border border-line px-4 py-3">
                <input type="radio" name="grant" value={s} defaultChecked={s === req.scope} />
                {t(s === "write" ? "set.mcpWrite" : "set.mcpRead")}
              </label>
            ))}
          </fieldset>
          <button name="decision" value="allow" className={`${btn} bg-ink text-paper`}>{t("oauth.allow")}</button>
          <button name="decision" value="deny" className={`${btn} border border-line hover:bg-surface`}>{t("oauth.deny")}</button>
          <p className="text-xs text-muted">{t("oauth.revoke")}</p>
        </form>
      )}
    </main>
  );
}
