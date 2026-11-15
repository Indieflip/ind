"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";

export type ClaimStatus = "en_cours" | "cloturee" | "annulee";
export interface ClaimInput {
  date: string; supplierId: string; supplierName: string; reference: string; product: string; subject: string;
  amount: string; credit: string; notes: string; status: ClaimStatus; anomalyId?: string; weighGapId?: string; receptionId?: string;
}

const STATUSES: ClaimStatus[] = ["en_cours", "cloturee", "annulee"];

async function values(d: ClaimInput) {
  const supplierId = Number(d.supplierId) || null;
  const supplier = supplierId ? await getDb().query.suppliers.findFirst({ where: eq(schema.suppliers.id, supplierId) }) : null;
  const money = (v: string) => { const n = num(v); return n != null ? String(Math.abs(n)) : null; };
  const status = STATUSES.includes(d.status) ? d.status : "en_cours";
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : new Date().toISOString().slice(0, 10),
    supplierId: supplier?.id ?? null,
    supplierName: supplier?.name ?? (d.supplierName.trim() || null),
    reference: d.reference.trim() || null,
    product: d.product.trim() || null,
    subject: d.subject.trim(),
    amount: money(d.amount),
    credit: money(d.credit),
    notes: d.notes.trim() || null,
    status,
    anomalyId: Number(d.anomalyId) || null,
    weighGapId: Number(d.weighGapId) || null,
    receptionId: Number(d.receptionId) || null,
    updatedAt: new Date(),
    closedAt: status === "en_cours" ? null : new Date(),
  };
}

export async function addClaimAction(d: ClaimInput) {
  const user = await assertUser(can.createAnomaly);
  if (!d.subject.trim()) return { error: "subject" };
  await getDb().insert(schema.claims).values({ ...(await values(d)), createdBy: user.id });
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

export async function updateClaimAction(id: number, d: ClaimInput) {
  await assertUser(can.manageAnomalies);
  if (!d.subject.trim()) return { error: "subject" };
  await getDb().update(schema.claims).set(await values(d)).where(eq(schema.claims.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

export async function setClaimStatusAction(id: number, status: ClaimStatus) {
  await assertUser(can.manageAnomalies);
  if (!STATUSES.includes(status)) return;
  await getDb().update(schema.claims).set({ status, updatedAt: new Date(), closedAt: status === "en_cours" ? null : new Date() }).where(eq(schema.claims.id, id));
  revalidatePath("/anomalies", "layout");
}

export async function deleteClaimAction(id: number) {
  await assertUser(can.manageAnomalies);
  await getDb().delete(schema.claims).where(eq(schema.claims.id, id));
  revalidatePath("/anomalies", "layout");
}
