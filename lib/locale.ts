import { cookies, headers } from "next/headers";
import { cache } from "react";
import { currentUser } from "./auth";
import { isLocale, pickLocale, translator, type Locale } from "./i18n";

export const LOCALE_COOKIE = "locale";

/** The user's saved language, else the one picked on the login page (cookie), else the browser's. */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await currentUser())?.locale;
  if (saved) return saved;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookie) ? cookie : pickLocale((await headers()).get("accept-language"));
});

/** Translation helpers for server components and actions. */
export const getT = cache(async () => translator(await getLocale()));
