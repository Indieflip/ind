/** Unité normalisée : première lettre en majuscule (« kg » → « Kg », « POT » → « Pot ») */
export function unitName(u: string | null | undefined) {
  const s = (u ?? "").trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
