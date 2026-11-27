"use server";
import { and, eq, notInArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function deleteReceptionAction(id: number) {
  const db = getDb();
  await assertUser(can.deleteDraftReception);
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id), columns: { consolidatedAt: true, deliveredAt: true, supplierName: true } });
  if (!rec) redirect("/receptions");
  if (rec.consolidatedAt) throw new Error("consolidated"); // un bon consolidé sert de preuve : jamais supprimé
  await db.transaction(async (tx) => {
    // Les écarts de prix et anomalies liés restent (historique), mais sans lien vers la réception
    await tx.update(schema.priceChanges).set({ receptionId: null }).where(eq(schema.priceChanges.receptionId, id));
    await tx.delete(schema.anomalies).where(and(eq(schema.anomalies.receptionId, id), notInArray(schema.anomalies.source, ["file", "weigh"])));
    // Anomalies importées gardées : détachées des lignes supprimées
    await tx.update(schema.anomalies).set({ lineId: null }).where(eq(schema.anomalies.receptionId, id));
    await tx.delete(schema.receptions).where(eq(schema.receptions.id, id));
  });
  revalidatePath("/receptions");
  redirect("/receptions");
}

/** Suppression groupée (bons non consolidés uniquement) */
export async function deleteReceptionsAction(ids: number[]) {
  await assertUser(can.deleteDraftReception);
  const db = getDb();
  let count = 0;
  for (const id of ids.filter((n) => Number.isInteger(n))) {
    const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id), columns: { consolidatedAt: true, deliveredAt: true, supplierName: true } });
    if (!rec || rec.consolidatedAt) continue;
    await db.transaction(async (tx) => {
      await tx.update(schema.priceChanges).set({ receptionId: null }).where(eq(schema.priceChanges.receptionId, id));
      await tx.delete(schema.anomalies).where(and(eq(schema.anomalies.receptionId, id), notInArray(schema.anomalies.source, ["file", "weigh"])));
    // Anomalies importées gardées : détachées des lignes supprimées
    await tx.update(schema.anomalies).set({ lineId: null }).where(eq(schema.anomalies.receptionId, id));
      await tx.delete(schema.receptions).where(eq(schema.receptions.id, id));
    });
    count++;
  }
  revalidatePath("/receptions");
  return { count };
}
