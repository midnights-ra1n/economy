import Link from "next/link";
import { ViewTransition } from "react";
import { currentUser } from "@/lib/auth";
import { getAccounts, getCategories } from "@/lib/budget";
import { localToday } from "@/lib/forecast";
import { addTransaction } from "./actions";
import { NavLinks, QuickAdd, TabBar } from "./client";
import { EntryForm } from "./ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pages redirect anonymous visitors; the layout only avoids putting account names in that response.
  const user = await currentUser();
  const accounts = user ? getAccounts(user.id) : [];
  return (
    <>
      {/* Floating rounded bar; the transparent strip around it lets clicks through to the page. */}
      <header className="pointer-events-none sticky top-0 z-20 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="pointer-events-auto mx-auto flex h-14 w-full max-w-[62rem] items-center justify-between gap-3 rounded-2xl bg-ink pr-2 pl-4 text-paper shadow-lg shadow-black/15">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <svg viewBox="0 0 512 512" className="size-6" aria-hidden>
              <rect width="512" height="512" rx="112" fill="var(--paper)" fillOpacity="0.14" />
              <path d="M96 340c60 0 80-120 140-120s70 70 110 70 50-80 70-120" fill="none" stroke="var(--accent)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="max-[40rem]:hidden">Economy</span>
          </Link>
          <NavLinks admin={user?.role === "admin"} />
          {accounts.length > 0 && (
            <QuickAdd>
              <EntryForm action={addTransaction} accounts={accounts} categories={getCategories(user!.id)} when="date" today={localToday()} />
            </QuickAdd>
          )}
        </div>
      </header>
      {/* Navigations are transitions, so pages crossfade where the browser supports view transitions. */}
      <ViewTransition>
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 pt-8 pb-36 desk:pb-12">{children}</main>
      </ViewTransition>
      <TabBar />
    </>
  );
}
