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

/** Suivi unique d'une anomalie */
export const STAGES = ["a_traiter", "reclamee", "a_verifier", "cloturee", "annulee"] as const;
export type Stage = (typeof STAGES)[number];
export const stageStyles: Record<Stage, string> = {
  a_traiter: "bg-red-100 text-red-800",
  reclamee: "bg-amber-100 text-amber-900",
  a_verifier: "bg-sky-100 text-sky-800",
  cloturee: "bg-emerald-100 text-emerald-800",
  annulee: "bg-stone-200 text-stone-600",
};
export const stageOf = (v: string | null | undefined): Stage => (STAGES.includes(v as Stage) ? (v as Stage) : "a_traiter");
export const isOpenStage = (s: Stage) => s === "a_traiter" || s === "reclamee" || s === "a_verifier";

/** Résolution d'une anomalie clôturée : par un avoir, ou par la marchandise livrée plus tard */
export const RESOLUTIONS = ["avoir", "livraison", "sans_suite"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
/**
 * Types de suivi :
 * - reclamation : réclamation avec relances ;
 * - verification_reclamation : vérification de l'avoir AVEC réclamation (même effet que « réclamation » dans les économies) ;
 * - verification : vérification de l'avoir SANS réclamation (on contrôle seulement l'avoir / la régularisation reçue).
 */
export const MODES = ["reclamation", "verification_reclamation", "verification"] as const;
export type Mode = (typeof MODES)[number];
/** Le suivi comporte une démarche auprès du fournisseur (relances, rappel à 3 jours, « avec réclamation » dans les économies) */
export const isClaimMode = (m: string | null | undefined) => m !== "verification";
export const modeIcon = (m: string | null | undefined) => (m === "verification" ? "🔍" : m === "verification_reclamation" ? "📞🔍" : "📞");

/** Anciens champs (statut / résultat) tenus à jour d'après l'étape, pour l'historique et les exports */
export function legacyOf(stage: Stage, resolution: string | null) {
  const status = stage === "a_traiter" ? "open" : stage === "reclamee" || stage === "a_verifier" ? "claimed" : stage === "cloturee" && resolution === "avoir" ? "credit_received" : "closed";
  const result: Outcome = stage === "cloturee" ? "cloture" : stage === "annulee" ? "annule" : "en_cours";
  return { status: status as "open" | "claimed" | "credit_received" | "closed", result };
}

/** Délai de relance par défaut (jours) */
export const DEFAULT_FOLLOW_UP_DAYS = 3;

/** Jours écoulés depuis la dernière action (ou la création) */
export function daysSince(lastActionAt: string | null, createdAt: Date | string, today = new Date()) {
  const ref = lastActionAt ? new Date(lastActionAt + "T12:00:00") : new Date(createdAt);
  return Math.floor((today.getTime() - ref.getTime()) / 86_400_000);
}
