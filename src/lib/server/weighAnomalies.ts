import "server-only";
import { WEIGH_TYPE } from "@/lib/anomaly";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
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
export async function syncWeighAnomalies(opts: { receptionId?: number } = {}) {
  const db = getDb();
  // Enregistrement d'une fiche de réception : seuls ses écarts de pesée sont recalculés (rapide)
  const only = opts.receptionId;
  const [gaps, existing, importedRecs] = await Promise.all([
    only ? db.select().from(schema.weighGaps).where(eq(schema.weighGaps.receptionId, only)) : db.select().from(schema.weighGaps),
    only ? db.select().from(schema.anomalies).where(and(eq(schema.anomalies.source, "weigh"), eq(schema.anomalies.groupKey, `rec:${only}`))) : db.select().from(schema.anomalies).where(eq(schema.anomalies.source, "weigh")),
    db.select({ id: schema.receptions.id }).from(schema.receptions).where(isNotNull(schema.receptions.importedFrom)),
  ]);
  // Anciennes fiches (générées depuis les anomalies importées) : jamais de nouvelle fiche d'anomalie,
  // l'écart de pesée est reporté sur la fiche d'anomalie existante de la réception
  const imported = new Set(importedRecs.map((r) => r.id));
  // Fiches « Écart de pesée » supprimées à la main : jamais recréées
  const dismissedRaw = (await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, "weigh_dismissed") }))?.value;
  const dismissed = new Set<string>(dismissedRaw ? JSON.parse(dismissedRaw) : []);
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
    if (dismissed.has(key)) continue;
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
      // Détail par produit (comme l'ancien onglet Écarts pesées) : poids manquant (kg) × prix unitaire
      items: lines.filter((g) => (num(g.gapQty) ?? 0) > 0).map((g) => ({ productId: g.productId ?? null, name: g.product, qty: Math.round((num(g.gapQty) ?? 0) * 1000) / 1000, unit: "Kg", price: num(g.unitPrice) })),
    };
    const cur = byKey.get(key);
    if (cur) {
      // Fiche consolidée : figée, sauf sur une ancienne fiche (importée) modifiée
      if (cur.consolidatedAt && !(first.receptionId && imported.has(first.receptionId))) continue;
      // Sans prix sur les lignes, le montant saisi à la main est gardé
      if (values.claimedAmount == null) values.claimedAmount = cur.claimedAmount;
      // Produits saisis à la main sur la fiche : gardés ; sinon le détail des écarts est repris
      // (liste vidée à la main : fiche gardée sans produit)
      const keepItems = cur.items != null;
      // (montant = somme des produits gardés quand tout est connu, ex. produits rajoutés sur une ancienne fiche)
      if (keepItems && cur.items!.length && cur.items!.every((x) => x.qty != null && x.price != null)) values.claimedAmount = String(Math.round(cur.items!.reduce((s, x) => s + x.qty! * x.price!, 0) * 100) / 100);
      if (cur.description !== values.description || cur.claimedAmount !== values.claimedAmount || cur.supplierId !== values.supplierId || cur.reference !== values.reference || !keepItems) {
        await db.update(schema.anomalies).set(keepItems ? { ...values, items: cur.items } : values).where(eq(schema.anomalies.id, cur.id));
      }
      continue;
    }
    if (first.receptionId && imported.has(first.receptionId)) {
      const own = await db.select().from(schema.anomalies).where(eq(schema.anomalies.receptionId, first.receptionId));
      const names = new Set(lines.map((g) => g.product.trim().toLowerCase()));
      const hit = (a: (typeof own)[number]) => names.has((a.productName ?? "").trim().toLowerCase()) || !!a.items?.some((it) => names.has(it.name.trim().toLowerCase()));
      const target = own.find(hit);
      if (target) {
        await db.update(schema.anomalies).set({
          ...values, claimedAmount: values.claimedAmount ?? target.claimedAmount,
          // Produit indiqué sur la fiche de réception : compte produit repris de la fiche existante s'il manque
          items: values.items.map((it) => (it.productId ? it : { ...it, productId: target.items?.find((x) => x.name.trim().toLowerCase() === it.name.trim().toLowerCase())?.productId ?? (values.items.length === 1 ? target.productId : null) ?? null })),
          type: "quantity", problemType: WEIGH_TYPE, source: "weigh", groupKey: key,
        }).where(eq(schema.anomalies.id, target.id));
        byKey.set(key, { ...target, groupKey: key });
        continue;
      }
      // Produit sans fiche d'anomalie sur l'ancienne fiche : nouvelle fiche « Écart de pesée » (ci-dessous)
    }
    // Étape de départ (lignes du fichier) d'après la colonne « Réclamation »
    const claimDates = lines.map((g) => g.claimDate).filter((d): d is string => !!d);
    const allFv = lines.every((g) => /fruits/i.test(g.nature ?? ""));
    let stage: "a_traiter" | "en_attente" | "cloturee" = "a_traiter";
    if (!first.receptionId && claimDates.length === lines.length && allFv && claimDates.every((d) => d === "2026-10-12")) stage = "cloturee";
    else if (claimDates.length) stage = "en_attente";
    const last = claimDates.sort().pop() ?? null;
    await db.insert(schema.anomalies).values({
      ...values, type: "quantity", problemType: WEIGH_TYPE, source: "weigh", groupKey: key, mode: "verification_reclamation", stage, ...legacyOf(stage, null),
      lastActionAt: last, followUp: last ? `Réclamation le ${last.split("-").reverse().map((p, i) => (i === 2 ? p.slice(2) : p)).join("/")}` : null,
      createdAt: new Date(`${lines.map((g) => g.date).sort()[0]}T12:00:00Z`), closedAt: stage === "cloturee" ? new Date(`${last}T12:00:00Z`) : null,
    });
  }
  // Groupes disparus (bon modifié, écarts supprimés) : l'anomalie encore à traiter est retirée
  // (jamais sur une ancienne fiche : la fiche d'anomalie existante est gardée)
  const gone = existing.filter((a) => a.groupKey && !groups.has(a.groupKey) && !a.consolidatedAt && a.stage === "a_traiter" && !(a.receptionId && imported.has(a.receptionId))).map((a) => a.id);
  if (gone.length) await db.delete(schema.anomalies).where(and(inArray(schema.anomalies.id, gone), isNull(schema.anomalies.consolidatedAt)));
}
