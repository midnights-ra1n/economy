import { redirect } from "next/navigation";
import { hasPasskey, isLoggedIn, isSetUp } from "@/lib/auth";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { setupMinutesLeft } from "@/lib/db";
import { getT } from "@/lib/locale";
import { setLocaleCookie } from "./actions";
import { LoginForm, SetupForm } from "./passkey-forms";

export default async function LoginPage() {
  if (await isLoggedIn()) redirect("/");
  const setup = !isSetUp();
  const minutes = setup ? setupMinutesLeft() : 0;
  const locked = setup && !minutes;
  const { t, locale } = await getT();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="anim-rise space-y-2">
        <p className="text-lg font-semibold tracking-tight">Economy</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">{t(locked ? "login.lockedTitle" : setup ? "login.setupTitle" : "login.welcome")}</h1>
        {setup && <p className="text-muted">{locked ? t("login.lockedText") : t("login.setupHelp", { min: minutes })}</p>}
      </div>
      {locked ? null : setup ? <SetupForm /> : <LoginForm passkeys={hasPasskey()} />}
      <form action={setLocaleCookie} className="flex justify-center gap-1 text-sm">
        {LOCALES.map((l) => (
          <button
            key={l} name="locale" value={l} aria-pressed={l === locale}
            className={`rounded-lg px-2.5 py-1 transition-colors ${l === locale ? "bg-ink/[0.06] font-medium text-ink" : "text-muted hover:text-ink"}`}
          >
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </form>
    </main>
  );
}
