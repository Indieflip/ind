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
/** Statuts : À traiter, En attente (réclamée ou à vérifier sur facture : on attend le fournisseur), Clôturée, Annulée */
export const STAGES = ["a_traiter", "en_attente", "cloturee", "annulee"] as const;
export type Stage = (typeof STAGES)[number];
export const stageStyles: Record<Stage, string> = {
  a_traiter: "bg-red-100 text-red-800",
  en_attente: "bg-amber-100 text-amber-900",
  cloturee: "bg-emerald-100 text-emerald-800",
  annulee: "bg-stone-200 text-stone-600",
};
/** Anciens statuts « Réclamée » et « À vérifier sur facture » : lus comme « En attente » */
export const stageOf = (v: string | null | undefined): Stage => (v === "reclamee" || v === "a_verifier" ? "en_attente" : STAGES.includes(v as Stage) ? (v as Stage) : "a_traiter");
export const isOpenStage = (s: Stage) => s === "a_traiter" || s === "en_attente";
export const OPEN_STAGES = ["a_traiter", "en_attente"] as const;
/** « En attente » de quoi : réponse du fournisseur, avoir / régul, livraison, retour marchandise */
export const WAITING = ["reponse", "avoir", "livraison", "retour"] as const;
export type Waiting = (typeof WAITING)[number];
export const waitingOf = (v: string | null | undefined): Waiting | null => (WAITING.includes(v as Waiting) ? (v as Waiting) : null);

/** Résolution d'une anomalie clôturée : par un avoir, ou par la marchandise livrée plus tard */
/** Résolutions : avoir / régularisation, livraison différée, retour de la marchandise au fournisseur, sans suite */
export const RESOLUTIONS = ["avoir", "livraison", "retour", "sans_suite"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
/**
 * Types de suivi :
 * - reclamation : réclamation avec relances ;
 * - verification_reclamation : vérification de l'avoir AVEC réclamation (même effet que « réclamation » dans les économies) ;
 * - verification : vérification de l'avoir SANS réclamation (on contrôle seulement l'avoir / la régularisation reçue).
 */
/** « Réclamation avec relances » fusionné dans « Avec relance » (verification_reclamation) */
export const MODES = ["verification_reclamation", "verification"] as const;
export type Mode = (typeof MODES)[number];
/** Le suivi comporte une démarche auprès du fournisseur (relances, rappel à 3 jours, « avec réclamation » dans les économies) */
export const isClaimMode = (m: string | null | undefined) => m !== "verification";
export const modeIcon = (m: string | null | undefined) => (m === "verification" ? "🔍" : m === "verification_reclamation" ? "📞🔍" : "📞");

/** Anciens champs (statut / résultat) tenus à jour d'après l'étape, pour l'historique et les exports */
export function legacyOf(stage: Stage, resolution: string | null) {
  const status = stage === "a_traiter" ? "open" : stage === "en_attente" ? "claimed" : stage === "cloturee" && resolution === "avoir" ? "credit_received" : "closed";
  const result: Outcome = stage === "cloturee" ? "cloture" : stage === "annulee" ? "annule" : "en_cours";
  return { status: status as "open" | "claimed" | "credit_received" | "closed", result };
}

/** Délai de relance par défaut (jours) */
export const DEFAULT_FOLLOW_UP_DAYS = 3;

/** Jours écoulés depuis la dernière action (ou la création) */
/** Vérification de l'avoir - sans réclamation : rappel si « À traiter » depuis 7 j, ou « À vérifier sur facture » depuis 15 j */
export const VERIFY_TODO_DAYS = 7;
export const VERIFY_CHECK_DAYS = 15;
export function verificationDue(stage: string, mode: string | null | undefined, days: number): "a_traiter" | "en_attente" | null {
  if (mode !== "verification") return null;
  const s = stageOf(stage);
  if (s === "a_traiter" && days >= VERIFY_TODO_DAYS) return "a_traiter";
  if (s === "en_attente" && days >= VERIFY_CHECK_DAYS) return "en_attente";
  return null;
}

export function daysSince(lastActionAt: string | null, createdAt: Date | string, today = new Date()) {
  const ref = lastActionAt ? new Date(lastActionAt + "T12:00:00") : new Date(createdAt);
  return Math.floor((today.getTime() - ref.getTime()) / 86_400_000);
}

/**
 * Quantité en trop : moyen de contrôle, pas une économie. Son montant est donné à titre informatif
 * et n'entre pas dans les statistiques d'économies.
 */
export function isInformative(a: { type: string; source?: string | null; description: string }) {
  return a.type === "quantity" && a.source !== "weigh" && /en trop/i.test(a.description);
}

/** Type d'anomalie des fiches venues de l'onglet « Écarts pesées » */
export const WEIGH_TYPE = "Écart de pesée";
