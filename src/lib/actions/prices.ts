"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function saveClaimAction(id: number, claim: string) {
  await assertUser(can.editPrices);
  const db = getDb();
  const [row] = await db.update(schema.priceChanges).set({ claim: claim.trim() || null }).where(eq(schema.priceChanges.id, id)).returning({ majId: schema.priceChanges.majId });
  // Même réclamation dans l'historique des modifications du Mercurial
  if (row?.majId) await db.update(schema.majLog).set({ claim: claim.trim() || null }).where(eq(schema.majLog.id, row.majId));
  revalidatePath("/reporting/prix");
  revalidatePath("/mercurial/mise-a-jour");
}
