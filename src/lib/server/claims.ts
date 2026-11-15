import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { lineDocLabel } from "@/lib/documents";
import { outcomeOf, type Outcome } from "@/lib/anomaly";

type ClaimStatus = "en_cours" | "cloturee" | "annulee";
const fromOutcome: Record<Outcome, ClaimStatus> = { en_cours: "en_cours", cloture: "cloturee", annule: "annulee" };
export const toOutcome: Record<ClaimStatus, Outcome> = { en_cours: "en_cours", cloturee: "cloture", annulee: "annule" };

const kg = (n: number | null) => (n == null ? "" : String(Math.round(Math.abs(n) * 1000) / 1000).replace(".", ","));

/**
 * L'onglet Réclamations centralise toutes les anomalies et les écarts de pesée (poids manquant) :
 * chaque ligne source a sa ligne de réclamation, tenue à jour à chaque ouverture de l'onglet.
 * Le statut et l'avoir d'une réclamation issue d'une anomalie suivent le « Résultat » et l'« Économie HT » de la fiche.
 * Le suivi saisi dans la réclamation est conservé.
 */
export async function syncClaims() {
  const db = getDb();
  const [anomalies, gaps, claims, recs, lines] = await Promise.all([
    db.select().from(schema.anomalies),
    db.select().from(schema.weighGaps),
    db.select().from(schema.claims),
    db.select({ id: schema.receptions.id, documents: schema.receptions.documents, blNumber: schema.receptions.blNumber }).from(schema.receptions),
    db.select({ id: schema.receptionLines.id, document: schema.receptionLines.document }).from(schema.receptionLines),
  ]);
  const recById = new Map(recs.map((r) => [r.id, r]));
  const lineDoc = new Map(lines.map((l) => [l.id, l.document]));
  const byAnomaly = new Map(claims.filter((c) => c.anomalyId).map((c) => [c.anomalyId!, c]));
  const byGap = new Map(claims.filter((c) => c.weighGapId).map((c) => [c.weighGapId!, c]));
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const inserts: (typeof schema.claims.$inferInsert)[] = [];

  for (const a of anomalies) {
    const rec = a.receptionId ? recById.get(a.receptionId) : undefined;
    const reference = (rec ? lineDocLabel(rec.documents, a.lineId ? lineDoc.get(a.lineId) : null, rec.blNumber) : null) ?? a.reference;
    const status = fromOutcome[outcomeOf(a.result)];
    const values = {
      date: day(a.createdAt), supplierId: a.supplierId, supplierName: a.supplierName, reference, product: a.productName,
      subject: a.description, credit: a.creditAmount, status, receptionId: a.receptionId,
    };
    const cur = byAnomaly.get(a.id);
    if (!cur) inserts.push({ ...values, anomalyId: a.id, source: "anomaly", notes: a.followUp, closedAt: status === "en_cours" ? null : new Date() });
    else if (cur.subject !== values.subject || cur.status !== status || cur.credit !== values.credit || cur.reference !== reference || cur.supplierId !== values.supplierId || cur.product !== values.product) {
      await db.update(schema.claims).set({ ...values, updatedAt: new Date(), closedAt: status === "en_cours" ? null : cur.closedAt ?? new Date() }).where(eq(schema.claims.id, cur.id));
    }
  }

  for (const g of gaps) {
    const gap = num(g.gapQty);
    if (gap == null || gap <= 0) continue; // poids en plus : rien à réclamer
    const amount = num(g.gapAmount);
    if (/non pris en compte/i.test(g.detail ?? "") || (amount != null && amount < 0.1)) continue; // sous la marge (10 centimes)
    const subject = `Écart de pesée : manque ${kg(gap)} kg (facturé ${kg(num(g.qtyInvoiced))}, contrôlé ${kg(num(g.qtyWeighed))})`;
    const values = {
      date: g.date, supplierId: g.supplierId, supplierName: (g.supplierRef ?? "").split(/\s+:\s+/)[0] || null, reference: g.reference,
      product: g.product, subject, amount: g.gapAmount != null ? String(Math.abs(num(g.gapAmount)!)) : null, receptionId: g.receptionId,
    };
    const cur = byGap.get(g.id);
    if (!cur) inserts.push({ ...values, weighGapId: g.id, source: "weigh", status: "en_cours", notes: g.detail });
    else if (cur.subject !== subject || cur.amount !== values.amount || cur.reference !== values.reference || cur.supplierId !== values.supplierId || cur.product !== values.product) {
      await db.update(schema.claims).set({ ...values, updatedAt: new Date() }).where(eq(schema.claims.id, cur.id));
    }
  }

  for (let k = 0; k < inserts.length; k += 200) await db.insert(schema.claims).values(inserts.slice(k, k + 200));
  // Lignes automatiques dont la source a disparu (anomalie ou écart supprimé)
  const orphans = claims.filter((c) => c.source !== "manual" && !c.anomalyId && !c.weighGapId).map((c) => c.id);
  const kept = new Set(gaps.filter((g) => (num(g.gapQty) ?? 0) > 0 && !/non pris en compte/i.test(g.detail ?? "") && !((num(g.gapAmount) ?? 1) < 0.1)).map((g) => g.id));
  const gone = claims.filter((c) => c.source === "weigh" && c.weighGapId && !kept.has(c.weighGapId)).map((c) => c.id);
  if (orphans.length + gone.length) await db.delete(schema.claims).where(inArray(schema.claims.id, [...orphans, ...gone]));
}
