/**
 * Numéros des fiches et des comptes : préfixe + numéro sur 3 (ou 4) chiffres, rallongé au-delà (FA999 → FA1000).
 * Fiches (réception, fiche de réception de marchandises, anomalie, réclamation) : numérotées par année, remise à zéro le 01/01.
 * Comptes (fournisseur, produit) : numéro permanent.
 */
export const NUM_FORMAT = {
  reception: { prefix: "RCP", digits: 3, yearly: true },
  sheet: { prefix: "FPM", digits: 3, yearly: true },
  anomaly: { prefix: "ANO", digits: 3, yearly: true },
  claim: { prefix: "R", digits: 4, yearly: true },
  returnSlip: { prefix: "BR", digits: 3, yearly: true },
  supplier: { prefix: "FR", digits: 4, yearly: false },
  product: { prefix: "PR", digits: 4, yearly: false },
} as const;
export type NumKind = keyof typeof NUM_FORMAT;

export function fmtNo(kind: NumKind, n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  const f = NUM_FORMAT[kind];
  return `${f.prefix}${String(Math.trunc(n)).padStart(f.digits, "0")}`;
}

/** N° d'une fiche de réception selon sa sorte : livraison (RCP…) ou bon de reprise / retour (BR…) */
export const recNo = (kind: string | null | undefined, n: number | null | undefined) => fmtNo(kind === "reprise" ? "returnSlip" : "reception", n);

/** Numéro tapé par l'utilisateur (« ANO401 », « ano 401 », « 401 ») → 401 */
export function parseNo(input: string | null | undefined) {
  const m = /(\d+)/.exec(String(input ?? ""));
  return m ? Number(m[1]) : null;
}

/** Année (heure de Paris) d'une date, pour la numérotation annuelle */
export const parisYear = (d: Date) => Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" }).format(d));

/** Jour (AAAA-MM-JJ, heure de Paris) d'une date ISO, pour le filtre de période des colonnes Date */
export const dayOf = (v: string | Date | null | undefined) => {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
};
