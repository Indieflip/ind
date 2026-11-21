import "server-only";
import { parisYear } from "@/lib/numbering";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { isClaimMode, isInformative, isOpenStage, stageOf } from "@/lib/anomaly";

export type AnomalyLite = {
  id: number; supplierId: number | null; supplierName: string; supplier: string | null; displayNumber: number; numberFinal: boolean; claimNo: number | null; informative: boolean; type: string; stage: string; resolution: string | null; mode: string;
  claimed: number | null; credit: number | null; createdAt: Date; closedAt: Date | null; consolidatedAt: Date | null; number: number | null; productName: string | null; description: string;
};

export async function loadAnomalies(): Promise<AnomalyLite[]> {
  const rows = await getDb()
    .select({ a: schema.anomalies, supplier: schema.suppliers.name })
    .from(schema.anomalies)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.anomalies.supplierId));
  // N° de fiche : définitif une fois consolidée, sinon provisoire (suite des numéros, par date)
  const nums = numberAnomalies(rows.map((r) => r.a));
  const prov = new Map([...nums].map(([id, v]) => [id, v.n]));
  return rows.map(({ a, supplier }) => ({
    id: a.id, supplierId: a.supplierId, supplierName: a.supplierName, supplier, claimNo: a.claimNo, informative: isInformative(a), type: a.type, displayNumber: a.number ?? prov.get(a.id) ?? 0, numberFinal: a.number != null, stage: a.stage, resolution: a.resolution, mode: a.mode,
    claimed: num(a.claimedAmount), credit: num(a.creditAmount), createdAt: a.createdAt, closedAt: a.closedAt, consolidatedAt: a.consolidatedAt,
    number: a.number, productName: a.productName, description: a.description,
  }));
}

/**
 * Économies réalisées :
 * - avoirs obtenus = « Économie HT » saisie sur les anomalies (montant de l'avoir) ;
 * - marchandise livrée en différé = montant en jeu des anomalies résolues par une livraison ;
 * - en attente = montant en jeu des anomalies encore ouvertes (réclamées ou à vérifier).
 */
export function savingsOf(all: AnomalyLite[]) {
  const sum = (xs: AnomalyLite[], k: "claimed" | "credit") => xs.reduce((s, a) => s + (a[k] ?? 0), 0);
  // Quantités en trop : contrôle seulement, hors statistiques
  const extra = all.filter((a) => a.informative);
  const list = all.filter((a) => !a.informative);
  // Économies = avoirs obtenus avec une réclamation (« Réclamation avec relances » ou « Vérification de l'avoir - avec réclamation »)
  const withClaim = list.filter((a) => isClaimMode(a.mode));
  // Clôturée « sans suite » : rien de récupéré, jamais comptée dans les économies (même si un montant d'avoir traîne)
  const credits = withClaim.filter((a) => (a.credit ?? 0) > 0 && a.resolution !== "sans_suite");
  const deferred = withClaim.filter((a) => stageOf(a.stage) === "cloturee" && a.resolution === "livraison");
  const verifiedCredits = list.filter((a) => !isClaimMode(a.mode) && (a.credit ?? 0) > 0 && a.resolution !== "sans_suite");
  const open = list.filter((a) => isOpenStage(stageOf(a.stage)));
  const waiting = open.filter((a) => stageOf(a.stage) !== "a_traiter");
  const waitingClaim = waiting.filter((a) => isClaimMode(a.mode));
  const noFollow = list.filter((a) => stageOf(a.stage) === "cloturee" && a.resolution === "sans_suite");
  const byMode = (m: "claim" | "verification") => {
    const xs = waiting.filter((a) => (m === "claim" ? isClaimMode(a.mode) : !isClaimMode(a.mode)));
    return { count: xs.length, amount: sum(xs, "claimed"), withoutAmount: xs.filter((a) => a.claimed == null).length };
  };
  const obtained = sum(credits, "credit") + sum(deferred.filter((a) => !(a.credit ?? 0)), "claimed");
  const pending = sum(waitingClaim, "claimed");
  return {
    credits: { count: credits.length, amount: sum(credits, "credit") },
    deferred: { count: deferred.length, amount: sum(deferred, "claimed") },
    verifiedCredits: { count: verifiedCredits.length, amount: sum(verifiedCredits, "credit") },
    extra: { count: extra.length, amount: sum(extra, "claimed") },
    obtained,
    pending: { count: waitingClaim.length, amount: pending, withoutAmount: waitingClaim.filter((a) => a.claimed == null).length },
    toProcess: { count: open.length - waiting.length, amount: sum(open.filter((a) => stageOf(a.stage) === "a_traiter"), "claimed") },
    noFollow: { count: noFollow.length, amount: sum(noFollow, "claimed") },
    reclamation: byMode("claim"),
    verification: byMode("verification"),
    rate: obtained + pending > 0 ? obtained / (obtained + pending) : null,
  };
}

/** Lundi (AAAA-MM-JJ) de la semaine d'une date, heure de Paris */
export function weekOf(d: Date) {
  const local = new Date(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d) + "T12:00:00Z");
  const day = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - day);
  return local.toISOString().slice(0, 10);
}

/** N° de fiche de chaque anomalie : définitif (consolidée) ou provisoire */
export async function anomalyNumbers() {
  const rows = await getDb().select({ id: schema.anomalies.id, number: schema.anomalies.number, createdAt: schema.anomalies.createdAt }).from(schema.anomalies);
  return numberAnomalies(rows);
}

/** Types d'économies : regroupement des types d'anomalie */
export const SAVING_KINDS = {
  quantite: ["missing", "quantity"],
  prix: ["price", "locked_price"],
  qualite: ["damaged", "temperature", "dlc", "wrong_product"],
  autre: ["hygiene", "missing_bl", "other"],
} as const;
export type SavingKind = keyof typeof SAVING_KINDS;
export const savingKindOf = (type: string): SavingKind =>
  ((Object.keys(SAVING_KINDS) as SavingKind[]).find((k) => (SAVING_KINDS[k] as readonly string[]).includes(type)) ?? "autre");

/**
 * N° de fiche d'anomalie (FA001…) : par année de création, remise à zéro le 01/01.
 * Numéro déjà attribué gardé ; les autres prennent la suite dans l'année, par date de création.
 */
export function numberAnomalies(rows: { id: number; number: number | null; createdAt: Date }[]) {
  const out = new Map<number, { n: number; final: boolean; year: number }>();
  const byYear = new Map<number, typeof rows>();
  for (const r of rows) { const y = parisYear(r.createdAt); byYear.set(y, [...(byYear.get(y) ?? []), r]); }
  for (const [year, list] of byYear) {
    const max = list.reduce((m, r) => Math.max(m, r.number ?? 0), 0);
    for (const r of list) if (r.number != null) out.set(r.id, { n: r.number, final: true, year });
    list.filter((r) => r.number == null).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id - y.id).forEach((r, i) => out.set(r.id, { n: max + i + 1, final: false, year }));
  }
  return out;
}
