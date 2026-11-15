"use server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { storeFile, parseDataUrl } from "@/lib/storage";
import { matchProduct } from "@/lib/server/maj";
import { outcomeOf } from "@/lib/anomaly";

const TYPES = schema.anomalyTypeEnum.enumValues;
const STATUSES = schema.anomalyStatusEnum.enumValues;

export async function createAnomalyAction(_p: { ok?: boolean; error?: string } | undefined, form: FormData) {
  const user = await assertUser(can.createAnomaly);
  const receptionId = Number(form.get("receptionId")) || null;
  const description = String(form.get("description") ?? "").trim();
  const type = String(form.get("type") ?? "other") as (typeof TYPES)[number];
  const productName = String(form.get("productName") ?? "").trim() || null;
  const photo = String(form.get("photo") ?? "");
  const nature = String(form.get("nature") ?? "").trim() || null;
  const nextActionAt = String(form.get("nextActionAt") ?? "") || null;
  // Une anomalie est toujours rattachée à un bon existant
  if (!receptionId || !description || !TYPES.includes(type)) return { error: "invalid" };
  const db = getDb();
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, receptionId) });
  if (!rec) return { error: "invalid" };
  let photoUrl: string | null = null;
  const parsed = photo ? parseDataUrl(photo) : null;
  if (parsed) photoUrl = await storeFile(parsed.buffer, parsed.contentType, "anomaly");
  const docs = (rec.documents as { type: string; number: string }[] | null) ?? (rec.blNumber ? [{ type: "bl", number: rec.blNumber }] : []);
  await db.insert(schema.anomalies).values({
    receptionId, supplierId: rec.supplierId, supplierName: rec.supplierName, description, type, productName, photoUrl, createdBy: user.id,
    nature, reference: docs.map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc" : "BL"} ${d.number}`).join(", ") || null,
    nextActionAt: nextActionAt && /^\d{4}-\d{2}-\d{2}$/.test(nextActionAt) ? nextActionAt : null,
    createdAt: rec.deliveredAt,
  });
  revalidatePath(`/receptions/${receptionId}`);
  revalidatePath("/anomalies");
  return { ok: true };
}

export async function updateAnomalyAction(
  id: number,
  data: { status?: string; creditAmount?: string; followUp?: string; description?: string; nature?: string; result?: string; lastActionAt?: string; nextActionAt?: string },
) {
  await assertUser(can.manageAnomalies);
  const set: Partial<typeof schema.anomalies.$inferInsert> = {};
  if (data.status && STATUSES.includes(data.status as (typeof STATUSES)[number])) {
    set.status = data.status as (typeof STATUSES)[number];
    set.closedAt = data.status === "closed" ? new Date() : null;
  }
  if (data.creditAmount !== undefined) {
    const n = num(data.creditAmount);
    set.creditAmount = n != null ? String(n) : null;
  }
  if (data.followUp !== undefined) set.followUp = data.followUp.trim() || null;
  if (data.description !== undefined && data.description.trim()) set.description = data.description.trim();
  if (data.nature !== undefined) set.nature = data.nature.trim() || null;
  if (data.result !== undefined) set.result = outcomeOf(data.result);
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (data.lastActionAt !== undefined) set.lastActionAt = day(data.lastActionAt);
  if (data.nextActionAt !== undefined) set.nextActionAt = day(data.nextActionAt);
  const db = getDb();
  const cur = await db.query.anomalies.findFirst({ where: eq(schema.anomalies.id, id), columns: { consolidatedAt: true } });
  if (cur?.consolidatedAt) return { error: "consolidated" };
  await db.update(schema.anomalies).set(set).where(eq(schema.anomalies.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

/** Consolidation des anomalies traitées : elles sortent du suivi et ne sont plus modifiables */
export async function consolidateAnomaliesAction(ids: number[]) {
  const user = await assertUser(can.consolidate);
  const clean = ids.filter((n) => Number.isInteger(n));
  if (!clean.length) return { count: 0 };
  // N° définitif attribué à la consolidation, dans l'ordre des dates, à la suite du dernier numéro (unique)
  const done = await getDb().transaction(async (tx) => {
    await tx.execute(sql`lock table anomalies in share row exclusive mode`);
    const rows = await tx
      .select({ id: schema.anomalies.id })
      .from(schema.anomalies)
      .where(and(inArray(schema.anomalies.id, clean), isNull(schema.anomalies.consolidatedAt)))
      .orderBy(asc(schema.anomalies.createdAt), asc(schema.anomalies.id));
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${schema.anomalies.number}), 0)::int` }).from(schema.anomalies);
    let n = max;
    for (const r of rows) {
      await tx.update(schema.anomalies).set({ consolidatedAt: new Date(), consolidatedBy: user.id, number: ++n }).where(eq(schema.anomalies.id, r.id));
    }
    return rows;
  });
  revalidatePath("/anomalies", "layout");
  return { count: done.length };
}

/** Écarts de pesée : modification d'une ligne (l'écart en kg et en € est recalculé) */
export interface WeighGapInput {
  date?: string; nature?: string; supplierId?: number | null; reference?: string; product?: string;
  qtyInvoiced?: string; unitPrice?: string; qtyWeighed?: string; acceptableLoss?: string; detail?: string; claimDate?: string;
}

export async function updateWeighGapAction(id: number, data: WeighGapInput) {
  await assertUser(can.manageAnomalies);
  const db = getDb();
  const [g] = await db.select().from(schema.weighGaps).where(eq(schema.weighGaps.id, id));
  if (!g) return { error: "not_found" };
  const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const n = (v: string | undefined, old: string | null) => (v === undefined ? num(old) : num(v));
  const set: Partial<typeof schema.weighGaps.$inferInsert> = {};
  if (data.date !== undefined && isoDate(data.date)) set.date = data.date;
  if (data.nature !== undefined) set.nature = data.nature.trim() || null;
  if (data.supplierId !== undefined) set.supplierId = data.supplierId;
  if (data.reference !== undefined) set.reference = data.reference.trim() || null;
  if (data.product !== undefined && data.product.trim()) {
    set.product = data.product.trim();
    const products = await db.select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId }).from(schema.products);
    set.productId = matchProduct(set.product, set.supplierId ?? g.supplierId, products)?.id ?? null;
  }
  if (data.detail !== undefined) set.detail = data.detail.trim() || null;
  if (data.claimDate !== undefined) set.claimDate = isoDate(data.claimDate);
  const inv = n(data.qtyInvoiced, g.qtyInvoiced);
  const price = n(data.unitPrice, g.unitPrice);
  const weighed = n(data.qtyWeighed, g.qtyWeighed);
  const loss = n(data.acceptableLoss, g.acceptableLoss);
  const str = (v: number | null) => (v == null ? null : String(v));
  set.qtyInvoiced = str(inv);
  set.unitPrice = str(price);
  set.qtyWeighed = str(weighed);
  set.acceptableLoss = str(loss);
  // Écart = facturé − contrôlé − perte acceptable ; écart € = écart × prix unitaire
  if (inv != null && weighed != null) {
    const gap = Math.round((inv - weighed - (loss ?? 0)) * 1000) / 1000;
    set.gapQty = String(gap);
    set.gapAmount = price != null ? String(Math.round(gap * price * 10000) / 10000) : null;
  }
  await db.update(schema.weighGaps).set(set).where(eq(schema.weighGaps.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

/** Nouvel écart de pesée saisi à la main (ou collé depuis un autre tableau) */
export async function addWeighGapAction(data: WeighGapInput) {
  await assertUser(can.manageAnomalies);
  if (!data.product?.trim()) return { error: "product" };
  const date = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : new Date().toISOString().slice(0, 10);
  const [row] = await getDb().insert(schema.weighGaps).values({ date, product: data.product.trim(), position: -1 }).returning({ id: schema.weighGaps.id });
  return updateWeighGapAction(row.id, { ...data, date });
}
