import { fr, type Dict } from "./fr";
import { en } from "./en";

export type Locale = "fr" | "en";
export const LOCALES: Locale[] = ["fr", "en"];
export const LOCALE_COOKIE = "rm_lang";

export function dictFor(locale: string | undefined): Dict {
  return locale === "en" ? en : fr;
}
export function normalizeLocale(l: string | undefined | null): Locale {
  return l === "en" ? "en" : "fr";
}
export type { Dict };
