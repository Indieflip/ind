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

/** Historique complet : rattacher une ligne sans correspondance à un produit du Mercurial (null pour la détacher) */
export async function linkMajProductAction(id: number, productId: number | null) {
  await assertUser(can.editPrices);
  const db = getDb();
  const product = productId ? await db.query.products.findFirst({ where: eq(schema.products.id, productId) }) : undefined;
  if (productId && !product) return { ok: false };
  await db.update(schema.majLog).set({ productId: product?.id ?? null, ...(product ? { supplierId: product.supplierId } : {}) }).where(eq(schema.majLog.id, id));
  // La variation de prix générée par cette ligne suit le même produit
  if (product) await db.update(schema.priceChanges).set({ productId: product.id, productName: product.name, supplierId: product.supplierId }).where(eq(schema.priceChanges.majId, id));
  revalidatePath("/mercurial/mise-a-jour");
  revalidatePath("/mercurial");
  return { ok: true };
}
