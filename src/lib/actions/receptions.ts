"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function deleteReceptionAction(id: number) {
  await assertUser(can.deleteReception);
  const db = getDb();
  await db.transaction(async (tx) => {
    // Les écarts de prix et anomalies liés restent (historique), mais sans lien vers la réception
    await tx.update(schema.priceChanges).set({ receptionId: null }).where(eq(schema.priceChanges.receptionId, id));
    await tx.delete(schema.anomalies).where(eq(schema.anomalies.receptionId, id));
    await tx.delete(schema.receptions).where(eq(schema.receptions.id, id));
  });
  revalidatePath("/receptions");
  redirect("/receptions");
}
