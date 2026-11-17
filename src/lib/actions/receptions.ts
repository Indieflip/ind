"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dictFor } from "@/lib/i18n";
import { syncSheetsSafe } from "@/lib/server/sheets";

export async function deleteReceptionAction(id: number) {
  const db = getDb();
  const user = await assertUser(can.deleteDraftReception);
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id), columns: { consolidatedAt: true, deliveredAt: true, supplierName: true } });
  if (!rec) redirect("/receptions");
  if (rec.consolidatedAt) throw new Error("consolidated"); // un bon consolidé sert de preuve : jamais supprimé
  await db.transaction(async (tx) => {
    // Les écarts de prix et anomalies liés restent (historique), mais sans lien vers la réception
    await tx.update(schema.priceChanges).set({ receptionId: null }).where(eq(schema.priceChanges.receptionId, id));
    await tx.delete(schema.anomalies).where(eq(schema.anomalies.receptionId, id));
    await tx.delete(schema.receptions).where(eq(schema.receptions.id, id));
  });
  const t = dictFor(user.locale);
  await syncSheetsSafe([rec.deliveredAt], `${t.rsheet.autoUpdate} : ${t.rsheet.autoDeleted} (${rec.supplierName})`, user);
  revalidatePath("/receptions");
  redirect("/receptions");
}

/** Suppression groupée (bons non consolidés uniquement) */
export async function deleteReceptionsAction(ids: number[]) {
  const user = await assertUser(can.deleteDraftReception);
  const db = getDb();
  let count = 0;
  const deleted: { deliveredAt: Date; supplierName: string }[] = [];
  for (const id of ids.filter((n) => Number.isInteger(n))) {
    const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id), columns: { consolidatedAt: true, deliveredAt: true, supplierName: true } });
    if (!rec || rec.consolidatedAt) continue;
    deleted.push(rec);
    await db.transaction(async (tx) => {
      await tx.update(schema.priceChanges).set({ receptionId: null }).where(eq(schema.priceChanges.receptionId, id));
      await tx.delete(schema.anomalies).where(eq(schema.anomalies.receptionId, id));
      await tx.delete(schema.receptions).where(eq(schema.receptions.id, id));
    });
    count++;
  }
  const t = dictFor(user.locale);
  await syncSheetsSafe(deleted.map((d) => d.deliveredAt), `${t.rsheet.autoUpdate} : ${t.rsheet.autoDeleted}`, user);
  revalidatePath("/receptions");
  return { count };
}
