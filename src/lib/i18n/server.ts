import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, negotiate, translator, type Locale } from "./index";

/** The cookie a person set with the switcher, else their browser's languages. */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return negotiate((await headers()).get("accept-language"));
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
