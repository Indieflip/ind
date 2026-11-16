import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { isOpenStage, stageOf } from "@/lib/anomaly";

export type AnomalyLite = {
  id: number; supplierId: number | null; supplierName: string; supplier: string | null; displayNumber: number; numberFinal: boolean; stage: string; resolution: string | null; mode: string;
  claimed: number | null; credit: number | null; createdAt: Date; closedAt: Date | null; consolidatedAt: Date | null; number: number | null; productName: string | null; description: string;
};

export async function loadAnomalies(): Promise<AnomalyLite[]> {
  const rows = await getDb()
    .select({ a: schema.anomalies, supplier: schema.suppliers.name })
    .from(schema.anomalies)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.anomalies.supplierId));
  // N° de fiche : définitif une fois consolidée, sinon provisoire (suite des numéros, par date)
  const max = rows.reduce((m, r) => Math.max(m, r.a.number ?? 0), 0);
  const prov = new Map(rows.filter((r) => r.a.number == null).sort((x, y) => x.a.createdAt.getTime() - y.a.createdAt.getTime() || x.a.id - y.a.id).map((r, i) => [r.a.id, max + i + 1]));
  return rows.map(({ a, supplier }) => ({
    id: a.id, supplierId: a.supplierId, supplierName: a.supplierName, supplier, displayNumber: a.number ?? prov.get(a.id) ?? 0, numberFinal: a.number != null, stage: a.stage, resolution: a.resolution, mode: a.mode,
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

/** N° de fiche de chaque anomalie : définitif (consolidée) ou provisoire */
export async function anomalyNumbers() {
  const rows = await getDb().select({ id: schema.anomalies.id, number: schema.anomalies.number, createdAt: schema.anomalies.createdAt }).from(schema.anomalies);
  const max = rows.reduce((m, r) => Math.max(m, r.number ?? 0), 0);
  const out = new Map<number, { n: number; final: boolean }>();
  for (const r of rows) if (r.number != null) out.set(r.id, { n: r.number, final: true });
  rows.filter((r) => r.number == null).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id - y.id).forEach((r, i) => out.set(r.id, { n: max + i + 1, final: false }));
  return out;
}
