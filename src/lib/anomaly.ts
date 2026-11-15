/** Résultat d'une anomalie (fiche d'anomalie) : Clôturé (vert), En cours (orange), Annulé (gris) */
export const OUTCOMES = ["en_cours", "cloture", "annule"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const outcomeStyles: Record<Outcome, string> = {
  cloture: "bg-emerald-100 text-emerald-800",
  en_cours: "bg-amber-100 text-amber-900",
  annule: "bg-stone-200 text-stone-600",
};

export function outcomeOf(v: string | null | undefined): Outcome {
  return OUTCOMES.includes(v as Outcome) ? (v as Outcome) : "en_cours";
}

/** Texte libre d'un fichier (« Vérifier l'avoir : ok le 21/10/26 ») → résultat */
export function outcomeFromText(text: string | null | undefined, status?: string): Outcome {
  const t = (text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/annul/.test(t)) return "annule";
  if (status === "closed" || status === "credit_received" || /\bok\b|\bras\b|a ete livre|receptionne|reception avoir le|avoir recu|clotur/.test(t)) return "cloture";
  return "en_cours";
}

/** Réclamations : vignettes de statut */
export const claimStyles: Record<"en_cours" | "cloturee" | "annulee", string> = {
  en_cours: "bg-amber-100 text-amber-900",
  cloturee: "bg-emerald-100 text-emerald-800",
  annulee: "bg-stone-200 text-stone-600",
};
