"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function updateMajClaimAction(id: number, claim: string) {
  await assertUser(can.editPrices);
  await getDb().update(schema.majLog).set({ claim: claim.trim() || null }).where(eq(schema.majLog.id, id));
  // Même réclamation sur la variation de prix générée dans le Suivi des prix
  await getDb().update(schema.priceChanges).set({ claim: claim.trim() || null }).where(eq(schema.priceChanges.majId, id));
  revalidatePath("/reporting/prix");
  revalidatePath("/reporting");
}
