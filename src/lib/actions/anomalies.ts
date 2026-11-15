"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { storeFile, parseDataUrl } from "@/lib/storage";

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
  if (data.result !== undefined) set.result = data.result.trim() || null;
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
  const done = await getDb()
    .update(schema.anomalies)
    .set({ consolidatedAt: new Date(), consolidatedBy: user.id })
    .where(and(inArray(schema.anomalies.id, clean), isNull(schema.anomalies.consolidatedAt)))
    .returning({ id: schema.anomalies.id });
  revalidatePath("/anomalies", "layout");
  return { count: done.length };
}

/** Écarts de pesée : détail et date de réclamation */
export async function updateWeighGapAction(id: number, data: { detail?: string; claimDate?: string; acceptableLoss?: string }) {
  await assertUser(can.manageAnomalies);
  const set: Partial<typeof schema.weighGaps.$inferInsert> = {};
  if (data.detail !== undefined) set.detail = data.detail.trim() || null;
  if (data.claimDate !== undefined) set.claimDate = /^\d{4}-\d{2}-\d{2}$/.test(data.claimDate) ? data.claimDate : null;
  if (data.acceptableLoss !== undefined) {
    const n = num(data.acceptableLoss);
    set.acceptableLoss = n != null ? String(n) : null;
  }
  await getDb().update(schema.weighGaps).set(set).where(eq(schema.weighGaps.id, id));
  revalidatePath("/anomalies", "layout");
}
