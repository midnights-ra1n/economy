import Link from "next/link";
import { ViewTransition } from "react";
import { isLoggedIn } from "@/lib/auth";
import { getAccounts, getCategories } from "@/lib/budget";
import { localToday } from "@/lib/forecast";
import { addTransaction } from "./actions";
import { NavLinks, QuickAdd, TabBar } from "./client";
import { EntryForm } from "./ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pages redirect anonymous visitors; the layout only avoids putting account names in that response.
  const accounts = (await isLoggedIn()) ? getAccounts() : [];
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/80 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <svg viewBox="0 0 512 512" className="size-6" aria-hidden>
              <rect width="512" height="512" rx="112" fill="var(--ink)" />
              <path d="M96 340c60 0 80-120 140-120s70 70 110 70 50-80 70-120" fill="none" stroke="var(--accent)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Economy
          </Link>
          <NavLinks />
          {accounts.length > 0 && (
            <QuickAdd>
              <EntryForm action={addTransaction} accounts={accounts} categories={getCategories()} when="date" today={localToday()} />
            </QuickAdd>
          )}
        </div>
      </header>
      {/* Navigations are transitions, so pages crossfade where the browser supports view transitions. */}
      <ViewTransition>
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 pt-6 pb-36 sm:pb-12">{children}</main>
      </ViewTransition>
      <TabBar />
    </>
  );
}
