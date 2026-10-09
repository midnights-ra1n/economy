"use client";

import { createContext, useContext, type ReactNode } from "react";
import { translator, type Locale } from "@/lib/i18n";

// Only the locale crosses to the client; both dictionaries are bundled (they are small).
const LocaleContext = createContext<Locale>("fr");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export const useT = () => translator(useContext(LocaleContext));
