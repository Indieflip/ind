import "server-only";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { isOpenStage, stageOf } from "@/lib/anomaly";

export type AnomalyLite = {
  id: number; supplierId: number | null; supplierName: string; stage: string; resolution: string | null; mode: string;
  claimed: number | null; credit: number | null; createdAt: Date; closedAt: Date | null; consolidatedAt: Date | null; number: number | null; productName: string | null; description: string;
};

export async function loadAnomalies(): Promise<AnomalyLite[]> {
  const rows = await getDb().select().from(schema.anomalies);
  return rows.map((a) => ({
    id: a.id, supplierId: a.supplierId, supplierName: a.supplierName, stage: a.stage, resolution: a.resolution, mode: a.mode,
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
export function savingsOf(list: AnomalyLite[]) {
  const sum = (xs: AnomalyLite[], k: "claimed" | "credit") => xs.reduce((s, a) => s + (a[k] ?? 0), 0);
  const credits = list.filter((a) => (a.credit ?? 0) > 0);
  const deferred = list.filter((a) => stageOf(a.stage) === "cloturee" && a.resolution === "livraison");
  const open = list.filter((a) => isOpenStage(stageOf(a.stage)));
  const waiting = open.filter((a) => stageOf(a.stage) !== "a_traiter");
  const noFollow = list.filter((a) => stageOf(a.stage) === "cloturee" && a.resolution === "sans_suite");
  const byMode = (m: string) => {
    const xs = waiting.filter((a) => a.mode === m);
    return { count: xs.length, amount: sum(xs, "claimed"), withoutAmount: xs.filter((a) => a.claimed == null).length };
  };
  const obtained = sum(credits, "credit") + sum(deferred.filter((a) => !(a.credit ?? 0)), "claimed");
  const pending = sum(waiting, "claimed");
  return {
    credits: { count: credits.length, amount: sum(credits, "credit") },
    deferred: { count: deferred.length, amount: sum(deferred, "claimed") },
    obtained,
    pending: { count: waiting.length, amount: pending, withoutAmount: waiting.filter((a) => a.claimed == null).length },
    toProcess: { count: open.length - waiting.length, amount: sum(open.filter((a) => stageOf(a.stage) === "a_traiter"), "claimed") },
    noFollow: { count: noFollow.length, amount: sum(noFollow, "claimed") },
    reclamation: byMode("reclamation"),
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
