/** Écritures différentes d'une même unité, ramenées à une seule */
export const UNIT_ALIASES: Record<string, string> = {
  Pce: "Pièce",
  Piece: "Pièce",
  Bte: "Boite",
  Boîte: "Boite",
  Seaux: "Seau",
  Sceaux: "Seau",
  Btl: "Bouteille",
};

/** Unité normalisée : première lettre en majuscule (« kg » → « Kg », « POT » → « Pot ») et alias fusionnés */
export function unitName(u: string | null | undefined) {
  const s = (u ?? "").trim().toLowerCase();
  if (!s) return "";
  const n = s.charAt(0).toUpperCase() + s.slice(1);
  return UNIT_ALIASES[n] ?? n;
}
