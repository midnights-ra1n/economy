import Link from "next/link";
import { ViewTransition } from "react";
import { currentUser } from "@/lib/auth";
import { getAccounts, getCategories } from "@/lib/budget";
import { localToday } from "@/lib/forecast";
import { getT } from "@/lib/locale";
import { VERSION, availableUpdate } from "@/lib/version";
import { addTransaction } from "./actions";
import { NavLinks, QuickAdd, TabBar } from "./client";
import { EntryForm } from "./ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pages redirect anonymous visitors; the layout only avoids putting account names in that response.
  const user = await currentUser();
  const accounts = user ? getAccounts(user.id) : [];
  // Only admins can act on it (by updating the image), so only they see it.
  const update = user?.role === "admin" ? await availableUpdate() : null;
  const { t } = await getT();
  return (
    <>
      {/* Floating rounded bar; the transparent strip around it lets clicks through to the page. */}
      <header className="pointer-events-none sticky top-0 z-20 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="pointer-events-auto mx-auto flex h-14 w-full max-w-[62rem] items-center justify-between gap-3 rounded-2xl bg-bar pr-2 pl-4 text-bar-ink shadow-lg ring-1 shadow-black/20 ring-bar-line">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <svg viewBox="0 0 512 512" className="size-6" aria-hidden>
              <rect width="512" height="512" rx="112" fill="#fff" fillOpacity="0.14" />
              <path d="M96 340c60 0 80-120 140-120s70 70 110 70 50-80 70-120" fill="none" stroke="var(--bar-accent)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="desk:max-[40rem]:hidden">Economy</span>
          </Link>
          <NavLinks admin={user?.role === "admin"} />
          {accounts.length > 0 && (
            <QuickAdd>
              <EntryForm action={addTransaction} accounts={accounts} categories={getCategories(user!.id)} when="date" today={localToday()} />
            </QuickAdd>
          )}
        </div>
      </header>
      {update && (
        <p role="status" className="mx-auto mt-3 flex w-[calc(100%-1.5rem)] max-w-[62rem] flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-accent/25 bg-accent/[0.07] px-4 py-2.5 text-sm">
          <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="min-w-0 flex-1">{t("upd.banner", { latest: update.version, current: VERSION })}</span>
          <a href={update.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{t("upd.notes")}</a>
        </p>
      )}
      {/* Navigations are transitions, so pages crossfade where the browser supports view transitions. */}
      <ViewTransition>
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 pt-8 pb-36 desk:pb-12">{children}</main>
      </ViewTransition>
      <TabBar />
    </>
  );
}
