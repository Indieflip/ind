"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { fmtNo } from "@/lib/numbering";
import { legacyOf, waitingList } from "@/lib/anomaly";
import { unitName } from "@/lib/units";
import { dictFor } from "@/lib/i18n";

type Input = { receptionId: number; date: string; items: { lineId: number; qty: number; unit: string; reason: string | null }[] };

/**
 * Bon de reprise / retour : produits de la livraison d'origine repris par le fournisseur.
 * Chaque produit met à jour sa fiche d'anomalie (ou en crée une « Retour marchandise »), passée « En attente de : Avoir / Régul ».
 */
export async function createReturnSlipAction(input: Input) {
  const user = await assertUser(can.receive);
  const t = dictFor(user.locale);
  const items = input.items.filter((i) => Number.isInteger(i.lineId) && Number.isFinite(i.qty) && i.qty > 0);
  if (!items.length || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "invalid" as const };
  const db = getDb();
  return db.transaction(async (tx) => {
    const rec = await tx.query.receptions.findFirst({ where: eq(schema.receptions.id, input.receptionId) });
    if (!rec) return { error: "not_found" as const };
    const lines = await tx.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, rec.id));
    const anomalies = await tx.select().from(schema.anomalies).where(eq(schema.anomalies.receptionId, rec.id));
    await tx.execute(sql`lock table return_slips in share row exclusive mode`);
    const year = Number(input.date.slice(0, 4));
    const [{ next }] = (await tx.execute<{ next: number }>(sql`select coalesce(max(seq), 0)::int + 1 as next from return_slips where year = ${year}`)).rows;
    const no = fmtNo("returnSlip", Number(next));
    const ddmmyy = `${input.date.slice(8, 10)}/${input.date.slice(5, 7)}/${input.date.slice(2, 4)}`;
    const norm = (x: string | null | undefined) => (x ?? "").trim().toLowerCase();
    const saved: (typeof schema.returnSlips.$inferInsert)["items"] = [];
    for (const it of items) {
      const line = lines.find((l) => l.id === it.lineId);
      if (!line) continue;
      const unit = unitName(it.unit) || line.unit || "Pièce";
      const qtyText = `${String(it.qty).replace(".", ",")} ${unit}`;
      const note = `${ddmmyy} : ${t.returnSlip.noteOn} ${no} : ${qtyText}${it.reason ? ` (${it.reason})` : ""}`;
      // Prix de la ligne seulement dans la même unité
      const price = num(line.unitPrice);
      const samePrice = price != null && unitName(unit) === unitName(line.unit ?? "") ? price : null;
      const existing = anomalies.find((a) => a.lineId === line.id || norm(a.productName) === norm(line.productName) || (a.items ?? []).some((x) => norm(x.name) === norm(line.productName)));
      let anomalyId: number | null = null;
      if (existing) {
        const waiting = [...new Set([...waitingList(existing.waitingFor), "avoir"])].join(",");
        await tx.update(schema.anomalies).set({
          stage: "en_attente", ...legacyOf("en_attente", existing.resolution), waitingFor: waiting,
          followUp: [existing.followUp, note].filter(Boolean).join("\n"), lastActionAt: input.date,
        }).where(eq(schema.anomalies.id, existing.id));
        anomalyId = existing.id;
      } else {
        const [row] = await tx.insert(schema.anomalies).values({
          receptionId: rec.id, lineId: line.id, supplierId: rec.supplierId, supplierName: rec.supplierName,
          productName: line.productName, productId: line.productId, reference: rec.blNumber,
          type: "other", problemType: t.wizard.returnProblem,
          description: `${t.returnSlip.noteOn} ${no} : ${qtyText}${it.reason ? ` ; ${it.reason}` : ""}`,
          items: [{ productId: line.productId, name: line.productName, qty: it.qty, unit, price: samePrice }],
          claimedAmount: samePrice != null ? String(Math.round(samePrice * it.qty * 100) / 100) : null,
          stage: "en_attente", ...legacyOf("en_attente", null), waitingFor: "avoir",
          followUp: note, lastActionAt: input.date, createdBy: user.id,
        }).returning({ id: schema.anomalies.id });
        anomalyId = row.id;
      }
      saved.push({ lineId: line.id, productId: line.productId, name: line.productName, qty: it.qty, unit, reason: it.reason, anomalyId });
    }
    if (!saved.length) return { error: "invalid" as const };
    const [slip] = await tx.insert(schema.returnSlips).values({
      year, seq: Number(next), date: input.date, receptionId: rec.id, supplierId: rec.supplierId, supplierName: rec.supplierName, items: saved, createdBy: user.id,
    }).returning({ id: schema.returnSlips.id });
    revalidatePath("/receptions", "layout");
    revalidatePath("/anomalies", "layout");
    return { ok: true as const, id: slip.id, no };
  });
}
