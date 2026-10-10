"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import type { Key } from "@/lib/i18n";
import { useT } from "../i18n-provider";

export function ConfirmButton({ message, ...props }: ComponentProps<"button"> & { message: string }) {
  return <button {...props} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }} />;
}

type State = { error?: string; ok?: string };

/** Form whose server action returns a message (errors stay readable in production). */
export function MessageForm({
  action, children, className,
}: {
  action: (s: State, f: FormData) => Promise<State>;
  children: ReactNode;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className={className} aria-busy={pending}>
      {children}
      {(state.error || state.ok) && (
        <p role="status" className={`anim-rise text-sm ${state.error ? "text-loss" : "text-gain"}`}>{state.error ?? state.ok}</p>
      )}
    </form>
  );
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const links = [
  { href: "/", label: "nav.home" as Key, icon: icon("M3 17l5-5 4 3 8-8M15 7h5v5") },
  { href: "/operations", label: "nav.operations" as Key, icon: icon("M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4") },
  { href: "/previsions", label: "nav.forecast" as Key, icon: icon("M4 5h16v15H4zM4 10h16M9 3v4M15 3v4") },
  { href: "/releves", label: "nav.statements" as Key, icon: icon("M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4") },
  { href: "/comptes", label: "nav.accounts" as Key, icon: icon("M3 9l9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18") },
  { href: "/reglages", label: "nav.settings" as Key, icon: icon("M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4") },
];

const useActive = () => {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
};

/** Desktop navbar links (hidden on mobile, where TabBar takes over; admins reach the panel from Réglages there). */
export function NavLinks({ admin }: { admin: boolean }) {
  const isActive = useActive();
  const { t } = useT();
  return (
    <ul className="hidden min-w-0 items-center gap-0.5 overflow-x-auto desk:flex">
      {[...links, ...(admin ? [{ href: "/admin", label: "nav.admin" as Key }] : [])].map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={isActive(l.href) ? "page" : undefined}
            className={`block rounded-xl px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${isActive(l.href) ? "bg-white/10 font-medium text-bar-ink" : "text-bar-muted hover:text-bar-ink"}`}
          >
            {t(l.label)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Mobile bottom tab bar. */
export function TabBar() {
  const isActive = useActive();
  const { t } = useT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-bar-line bg-bar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg desk:hidden">
      <ul className="mx-auto flex max-w-lg px-1">
        {links.map((l) => (
          <li key={l.href} className="min-w-0 flex-1">
            <Link
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 truncate px-0.5 pt-2 pb-1.5 text-[10.5px] transition-colors ${isActive(l.href) ? "text-bar-accent" : "text-bar-muted"}`}
            >
              {l.icon}
              {t(l.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Add" button (navbar on desktop, floating on mobile) opening the quick-add form in a dialog. */
export function QuickAdd({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useT();
  const plus = <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />;
  return (
    <>
      <button
        onClick={() => ref.current?.showModal()}
        className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-bar-accent px-3 py-1.5 text-sm font-medium text-bar transition-transform active:scale-95 desk:flex"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>{plus}</svg>
        {t("common.add")}
      </button>
      <button
        onClick={() => ref.current?.showModal()}
        aria-label={t("quick.aria")}
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-full bg-bar-accent text-bar shadow-lg shadow-black/25 ring-4 ring-paper transition-transform active:scale-90 desk:hidden"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden>{plus}</svg>
      </button>
      <Sheet sheet={ref} title={t("quick.title")}>{children}</Sheet>
    </>
  );
}

/** Pencil button of a list row, opening its pre-filled form in a dialog. */
export function EditButton({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useT();
  return (
    <>
      <button onClick={() => ref.current?.showModal()} aria-label={t("common.edit")} title={t("common.edit")}
        className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink">
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M10.5 2.5l3 3L6 13H3v-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
      </button>
      <Sheet sheet={ref} title={t("common.edit")}>{children}</Sheet>
    </>
  );
}

/** Bottom sheet on mobile, centered dialog on desktop. */
function Sheet({ sheet: ref, title, children }: { sheet: RefObject<HTMLDialogElement | null>; title: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <dialog
      ref={ref}
      // Close once the form is submitted; the server action keeps running and refreshes the page.
      onSubmit={() => setTimeout(() => ref.current?.close(), 50)}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="sheet m-0 mt-auto w-full max-w-none rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink sm:m-auto sm:max-w-md sm:rounded-3xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <button onClick={() => ref.current?.close()} aria-label={t("common.close")} className="grid size-8 place-items-center rounded-full text-muted hover:bg-paper">
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
      {children}
    </dialog>
  );
}
