"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useRef, type ComponentProps, type ReactNode } from "react";

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
  { href: "/", label: "Accueil", icon: icon("M3 17l5-5 4 3 8-8M15 7h5v5") },
  { href: "/operations", label: "Opérations", icon: icon("M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4") },
  { href: "/previsions", label: "Prévisions", icon: icon("M4 5h16v15H4zM4 10h16M9 3v4M15 3v4") },
  { href: "/comptes", label: "Comptes", icon: icon("M3 9l9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18") },
  { href: "/reglages", label: "Réglages", icon: icon("M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4") },
];

const useActive = () => {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
};

/** Desktop navbar links (hidden on mobile, where TabBar takes over). */
export function NavLinks() {
  const isActive = useActive();
  return (
    <ul className="hidden items-center gap-1 sm:flex">
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={isActive(l.href) ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${isActive(l.href) ? "bg-ink/[0.06] font-medium text-ink" : "text-muted hover:text-ink"}`}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Mobile bottom tab bar. */
export function TabBar() {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:hidden">
      <ul className="mx-auto flex max-w-md justify-around px-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] transition-colors ${isActive(l.href) ? "text-accent" : "text-muted"}`}
            >
              {l.icon}
              {l.label}
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
  const plus = <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />;
  return (
    <>
      <button
        onClick={() => ref.current?.showModal()}
        className="hidden items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper transition-transform active:scale-95 sm:flex"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>{plus}</svg>
        Ajouter
      </button>
      <button
        onClick={() => ref.current?.showModal()}
        aria-label="Ajouter une opération"
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition-transform active:scale-90 sm:hidden"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden>{plus}</svg>
      </button>
      <dialog
        ref={ref}
        // Close once the form is submitted; the server action keeps running and refreshes the page.
        onSubmit={() => setTimeout(() => ref.current?.close(), 50)}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="sheet m-0 mt-auto w-full max-w-none rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink sm:m-auto sm:max-w-md sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Nouvelle opération</h2>
          <button onClick={() => ref.current?.close()} aria-label="Fermer" className="grid size-8 place-items-center rounded-full text-muted hover:bg-paper">
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}
