"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { priceDiffPct } from "@/lib/rules";

export async function saveClaimAction(id: number, claim: string) {
  await assertUser(can.editPrices);
  await getDb().update(schema.priceChanges).set({ claim: claim.trim() || null }).where(eq(schema.priceChanges.id, id));
  revalidatePath("/reporting/prix");
}

/** « Ajouter une ligne » : écart repéré sur facture ou correction du mercurial */
export async function addPriceLineAction(_prev: { ok?: boolean; error?: string } | undefined, form: FormData) {
  const user = await assertUser(can.editPrices);
  const productId = Number(form.get("productId"));
  const newPrice = num(form.get("newPrice"));
  const source = form.get("source") === "manual" ? "manual" : "invoice";
  const invoiceRef = String(form.get("invoiceRef") ?? "").trim() || null;
  const claim = String(form.get("claim") ?? "").trim() || null;
  if (!productId || newPrice == null || newPrice < 0) return { error: "invalid" };
  const db = getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return { error: "invalid" };
  const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, product.supplierId) });
  const old = num(product.price);
  await db.transaction(async (tx) => {
    await tx.insert(schema.priceChanges).values({
      supplierId: product.supplierId,
      supplierName: supplier?.name ?? "",
      productId,
      productName: product.name,
      unit: product.unit,
      oldPrice: old != null ? String(old) : null,
      newPrice: String(newPrice),
      pct: priceDiffPct(newPrice, old),
      type: old == null ? "new_product" : newPrice >= old ? "increase" : "decrease",
      source,
      invoiceRef,
      claim,
      createdBy: user.id,
    });
    await tx.update(schema.products).set({ price: String(newPrice) }).where(eq(schema.products.id, productId));
  });
  revalidatePath("/reporting/prix");
  return { ok: true };
}
