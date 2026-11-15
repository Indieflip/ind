// Comparaison du prix d'un BL avec la tranche de prix de référence (mercurial ou fruits et légumes).
// Un prix compris entre le minimum et le maximum n'est pas un écart.

export interface PriceRef {
  min: number | null;
  max: number | null;
  locked: boolean;
}

export type PriceCheck =
  | { kind: "none" } // pas de prix sur le BL
  | { kind: "new" } // pas de prix de référence : rajout
  | { kind: "ok" } // dans la tranche
  | { kind: "increase"; bound: number; pct: number } // au-dessus du maximum
  | { kind: "decrease"; bound: number; pct: number } // en dessous du minimum
  | { kind: "locked"; bound: number; pct: number }; // prix bloqué non respecté

const pct = (p: number, ref: number) => (ref === 0 ? 0 : Math.round(((p - ref) / ref) * 1000) / 10);
const EPS = 0.00005;

export function normalizeRef(ref: PriceRef): { min: number; max: number } | null {
  const min = ref.min ?? ref.max;
  const max = ref.max ?? ref.min;
  if (min == null || max == null) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export function checkPrice(price: number | null | undefined, ref: PriceRef): PriceCheck {
  if (price == null || Number.isNaN(price)) return { kind: "none" };
  const r = normalizeRef(ref);
  if (!r) return { kind: "new" };
  if (price > r.max + EPS) return ref.locked ? { kind: "locked", bound: r.max, pct: pct(price, r.max) } : { kind: "increase", bound: r.max, pct: pct(price, r.max) };
  // Prix bloqué : seul un tarif SUPÉRIEUR au prix bloqué est une anomalie ; un tarif inférieur est accepté
  if (price < r.min - EPS) return ref.locked ? { kind: "ok" } : { kind: "decrease", bound: r.min, pct: pct(price, r.min) };
  return { kind: "ok" };
}

/** Index du mois (0-11) d'une date, heure de Paris */
export function parisMonth(d: Date) {
  return Number(new Intl.DateTimeFormat("fr-FR", { month: "numeric", timeZone: "Europe/Paris" }).format(d)) - 1;
}

/** Tranche du mois pour un produit fruits et légumes : [moins, plus] du mois */
export function fvRange(prices: (number | null)[], month: number) {
  return { min: prices[month * 2] ?? null, max: prices[month * 2 + 1] ?? null };
}
