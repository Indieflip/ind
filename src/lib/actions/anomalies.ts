"use server";
import { eq } from "drizzle-orm";
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
  const supplierId = Number(form.get("supplierId")) || null;
  const description = String(form.get("description") ?? "").trim();
  const type = String(form.get("type") ?? "other") as (typeof TYPES)[number];
  const productName = String(form.get("productName") ?? "").trim() || null;
  const photo = String(form.get("photo") ?? "");
  if (!supplierId || !description || !TYPES.includes(type)) return { error: "invalid" };
  const db = getDb();
  const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, supplierId) });
  if (!supplier) return { error: "invalid" };
  let photoUrl: string | null = null;
  const parsed = photo ? parseDataUrl(photo) : null;
  if (parsed) photoUrl = await storeFile(parsed.buffer, parsed.contentType, "anomaly");
  await db.insert(schema.anomalies).values({ supplierId, supplierName: supplier.name, description, type, productName, photoUrl, createdBy: user.id });
  revalidatePath("/anomalies");
  return { ok: true };
}

export async function updateAnomalyAction(id: number, data: { status?: string; creditAmount?: string; followUp?: string }) {
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
  await getDb().update(schema.anomalies).set(set).where(eq(schema.anomalies.id, id));
  revalidatePath("/anomalies");
}
