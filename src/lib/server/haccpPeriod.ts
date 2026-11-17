import { dictFor } from "@/lib/i18n";

/** « du 01/11/26 au 17/11/26 », « jusqu'au … », « toutes les réceptions » */
export function periodLabel(from: string | undefined, to: string | undefined, locale: string) {
  const t = dictFor(locale === "en" ? "en" : "fr").haccpReg;
  const d = (x: string) => x.split("-").reverse().map((p, i) => (i === 2 ? p.slice(2) : p)).join("/");
  if (from && to) return from === to ? `${t.on} ${d(from)}` : `${t.from} ${d(from)} ${t.to} ${d(to)}`;
  if (from) return `${t.since} ${d(from)}`;
  if (to) return `${t.until} ${d(to)}`;
  return t.all;
}
