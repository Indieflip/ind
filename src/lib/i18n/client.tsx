"use client";
import { createContext, useContext } from "react";
import { dictFor, type Dict, type Locale } from "./index";

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: "fr", t: dictFor("fr") });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, t: dictFor(locale) }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
