import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { legacyOf } from "@/lib/anomaly";

const kg = (n: number) => String(Math.round(Math.abs(n) * 1000) / 1000).replace(".", ",");
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * Écarts de pesée réclamés par bon : les écarts (poids manquant, au-delà de la marge) d'un même BL / facture
 * forment une seule anomalie, avec le total en €. Elle suit ensuite le même parcours que les autres anomalies.
 * Reprise du fichier : écarts de fruits et légumes réclamés le 12/10/26 → clôturés ; autre date de réclamation → « Réclamée ».
 */
export async function syncWeighAnomalies() {
  const db = getDb();
  const [gaps, existing] = await Promise.all([
    db.select().from(schema.weighGaps),
    db.select().from(schema.anomalies).where(eq(schema.anomalies.source, "weigh")),
  ]);
  const groups = new Map<string, (typeof gaps)[number][]>();
  for (const g of gaps) {
    const q = num(g.gapQty);
    const amount = num(g.gapAmount);
    if (q == null || q <= 0) continue;
    if (/non pris en compte/i.test(g.detail ?? "") || (amount != null && amount < 0.1)) continue;
    const key = g.receptionId ? `rec:${g.receptionId}` : `ref:${(g.supplierRef ?? g.product).trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  const byKey = new Map(existing.map((a) => [a.groupKey ?? "", a]));
  for (const [key, lines] of groups) {
    lines.sort((a, b) => a.product.localeCompare(b.product, "fr"));
    const total = lines.reduce((s, g) => s + (num(g.gapAmount) ?? 0), 0);
    const totalKg = lines.reduce((s, g) => s + (num(g.gapQty) ?? 0), 0);
    const first = lines[0];
    const description = `Écarts de pesée : manque ${kg(totalKg)} kg au total (${eur(total)}) — ${lines
      .map((g) => `${g.product} : ${kg(num(g.gapQty) ?? 0)} kg${num(g.gapAmount) != null ? ` (${eur(num(g.gapAmount)!)})` : ""}`)
      .join(" ; ")}`;
    const values = {
      supplierId: lines.find((g) => g.supplierId)?.supplierId ?? null,
      supplierName: (first.supplierRef ?? "").split(/\s+:\s+/)[0] || "—",
      productName: lines.length === 1 ? first.product : `${lines.length} produits`,
      description,
      reference: lines.find((g) => g.reference)?.reference ?? null,
      nature: first.nature,
      claimedAmount: total > 0 ? String(Math.round(total * 100) / 100) : null,
      receptionId: first.receptionId,
    };
    const cur = byKey.get(key);
    if (cur) {
      if (cur.consolidatedAt) continue;
      if (cur.description !== values.description || cur.claimedAmount !== values.claimedAmount || cur.supplierId !== values.supplierId || cur.reference !== values.reference) {
        await db.update(schema.anomalies).set(values).where(eq(schema.anomalies.id, cur.id));
      }
      continue;
    }
    // Étape de départ (lignes du fichier) d'après la colonne « Réclamation »
    const claimDates = lines.map((g) => g.claimDate).filter((d): d is string => !!d);
    const allFv = lines.every((g) => /fruits/i.test(g.nature ?? ""));
    let stage: "a_traiter" | "reclamee" | "cloturee" = "a_traiter";
    if (!first.receptionId && claimDates.length === lines.length && allFv && claimDates.every((d) => d === "2026-10-12")) stage = "cloturee";
    else if (claimDates.length) stage = "reclamee";
    const last = claimDates.sort().pop() ?? null;
    await db.insert(schema.anomalies).values({
      ...values, type: "quantity", source: "weigh", groupKey: key, mode: "reclamation", stage, ...legacyOf(stage, null),
      lastActionAt: last, followUp: last ? `Réclamation le ${last.split("-").reverse().map((p, i) => (i === 2 ? p.slice(2) : p)).join("/")}` : null,
      createdAt: new Date(`${lines.map((g) => g.date).sort()[0]}T12:00:00Z`), closedAt: stage === "cloturee" ? new Date(`${last}T12:00:00Z`) : null,
    });
  }
  // Groupes disparus (bon modifié, écarts supprimés) : l'anomalie encore à traiter est retirée
  const gone = existing.filter((a) => a.groupKey && !groups.has(a.groupKey) && !a.consolidatedAt && a.stage === "a_traiter").map((a) => a.id);
  if (gone.length) await db.delete(schema.anomalies).where(and(inArray(schema.anomalies.id, gone), isNull(schema.anomalies.consolidatedAt)));
}
