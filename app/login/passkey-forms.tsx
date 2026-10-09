"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState } from "react";
import { useT } from "../i18n-provider";
import type { FormState } from "./actions";
import { authenticationOptions, login, registrationOptions, setup, verifyAuthentication, verifyRegistration } from "./actions";

const btn = "w-full rounded-xl bg-ink px-4 py-3 font-medium text-paper transition-transform active:scale-[0.98] disabled:opacity-50";
const ghost = "w-full rounded-xl border border-line px-4 py-3 font-medium transition-colors hover:bg-surface disabled:opacity-50";
const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base focus:border-accent focus:outline-none";

function Input({ label, ...props }: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <input className={input} {...props} />
    </label>
  );
}

/** Like <form action>, minus React's automatic field reset, so a typo does not wipe the whole form. */
function useKeepFieldsAction(fn: (s: FormState, f: FormData) => Promise<FormState>) {
  const [state, action, pending] = useActionState(fn, {});
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => action(form));
  };
  return { state, onSubmit, pending };
}

const Message = ({ text }: { text?: string }) =>
  text ? <p role="alert" className="anim-rise text-sm text-loss">{text}</p> : null;

/** First run: creates the administrator account (open for a few minutes after the server starts). */
export function SetupForm() {
  const { state, onSubmit, pending } = useKeepFieldsAction(setup);
  const { t } = useT();
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label={t("login.username")} name="username" required maxLength={40} autoComplete="username" autoFocus />
      <Input label={t("login.passwordMin")} name="password" type="password" required minLength={10} autoComplete="new-password" />
      <Input label={t("login.confirm")} name="confirm" type="password" required minLength={10} autoComplete="new-password" />
      <button className={btn} disabled={pending}>{pending ? t("login.creating") : t("login.create")}</button>
      <Message text={state.error} />
    </form>
  );
}

export function LoginForm({ passkeys }: { passkeys: boolean }) {
  const { state, onSubmit, pending } = useKeepFieldsAction(login);
  const router = useRouter();
  const [passkeyError, setPasskeyError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  async function withPasskey() {
    setPasskeyError("");
    setBusy(true);
    try {
      await verifyAuthentication(await startAuthentication({ optionsJSON: await authenticationOptions() }));
      router.push("/");
    } catch (e) {
      // The browser's own errors (cancelled, timed out) are readable; server ones are hidden in production.
      setPasskeyError(e instanceof Error && e.name !== "Error" ? e.message : t("login.passkeyFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label={t("login.username")} name="username" required autoComplete="username" />
        <Input label={t("login.password")} name="password" type="password" required autoComplete="current-password" />
        <button className={btn} disabled={pending}>{pending ? t("login.signingIn") : t("login.signIn")}</button>
        <Message text={state.error} />
      </form>
      {passkeys && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t("login.or")}<span className="h-px flex-1 bg-line" /></div>
          <button type="button" onClick={withPasskey} className={ghost} disabled={busy}>
            {busy ? "…" : t("login.usePasskey")}
          </button>
          <Message text={passkeyError} />
        </>
      )}
    </div>
  );
}

/** Optional: adds a passkey for this device, once logged in. */
export function AddPasskeyForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { t } = useT();
  // onSubmit rather than <form action>: React resets fields after an action, losing the input on error.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name"));
    setError("");
    setPending(true);
    try {
      await verifyRegistration(await startRegistration({ optionsJSON: await registrationOptions() }), name);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.name !== "Error" ? err.message : t("pk.failed"));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="block flex-1 space-y-1 text-sm">
        <span className="text-muted">{t("pk.device")}</span>
        <input name="name" required maxLength={50} placeholder="iPhone, MacBook…" className={input} />
      </label>
      <button className={`${ghost} sm:w-auto`} disabled={pending}>{pending ? "…" : t("pk.add")}</button>
      <Message text={error} />
    </form>
  );
}
