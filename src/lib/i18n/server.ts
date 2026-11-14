import "server-only";
import { cookies } from "next/headers";
import { dictFor, normalizeLocale, LOCALE_COOKIE, type Locale } from "./index";

export async function getLocale(): Promise<Locale> {
  return normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function getDict() {
  const locale = await getLocale();
  return { locale, t: dictFor(locale) };
}
