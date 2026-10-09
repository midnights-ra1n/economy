"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, type ComponentProps, type ReactNode } from "react";

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
  { href: "/previsions", label: "Prévisions", icon: icon("M4 6h16M4 12h16M4 18h10M8 3v6M16 9v6") },
  { href: "/comptes", label: "Comptes", icon: icon("M3 9l9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18") },
  { href: "/reglages", label: "Réglages", icon: icon("M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4") },
];

/** Bottom tab bar on mobile, inline tabs on desktop. */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:static sm:border-0 sm:bg-transparent sm:pb-0 sm:backdrop-blur-none">
      <ul className="mx-auto flex max-w-md justify-around px-2 sm:max-w-none sm:justify-end sm:gap-1 sm:px-0">
        {links.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-[11px] transition-colors duration-200 sm:flex-row sm:gap-2 sm:rounded-full sm:px-3.5 sm:text-sm ${
                  active ? "text-ink sm:bg-ink sm:text-paper" : "text-muted hover:text-ink"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors duration-200 sm:hidden ${active ? "bg-brass/25" : ""}`}>{l.icon}</span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
