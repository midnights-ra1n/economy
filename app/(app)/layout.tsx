import { ViewTransition } from "react";
import { Nav } from "./client";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <span className="font-display text-2xl">Economy</span>
        <Nav />
      </header>
      {/* Navigations are transitions, so pages crossfade where the browser supports view transitions. */}
      <ViewTransition>
        <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 pt-4 pb-32 sm:pb-12">{children}</main>
      </ViewTransition>
    </>
  );
}
