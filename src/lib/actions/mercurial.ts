"use server";
import { and, eq, sql } from "drizzle-orm";
import { unitName } from "@/lib/units";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { priceDiffPct } from "@/lib/rules";
import { categoryCodeFromNature } from "@/lib/nature";

async function categoryIdFor(nature: string | null) {
  const code = categoryCodeFromNature(nature);
  if (!code) return null;
  return (await getDb().query.categories.findFirst({ where: eq(schema.categories.code, code) }))?.id ?? null;
}

type R = { ok?: boolean; error?: string } | undefined;

function refresh() {
  revalidatePath("/mercurial", "layout");
}

async function ensureUnit(name: string) {
  const n = unitName(name);
  if (n) await getDb().insert(schema.units).values({ name: n }).onConflictDoNothing();
  return n;
}

/** Nouvelle ligne du mercurial : fournisseur (existant ou nouveau), produit, unité, prix */
export async function addMercurialRowAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.editMercurial);
  const db = getDb();
  let supplierId = Number(form.get("supplierId")) || null;
  const newSupplier = String(form.get("newSupplier") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const unit = await ensureUnit(String(form.get("unit") ?? ""));
  const price = num(form.get("price"));
  const priceMin = num(form.get("priceMin"));
  const service = String(form.get("service") ?? "").trim() || null;
  const nature = String(form.get("nature") ?? "").trim() || null;
  const priceLocked = form.get("priceLocked") === "on";
  const categoryId = await categoryIdFor(nature);
  if (!supplierId && newSupplier) {
    const found = await db.query.suppliers.findFirst({ where: eq(sql`lower(${schema.suppliers.name})`, newSupplier.toLowerCase()) });
    supplierId = found?.id ?? (await db.insert(schema.suppliers).values({ name: newSupplier }).returning())[0].id;
  }
  if (!supplierId || !name || !unit) return { error: "invalid" };
  const dup = await db.query.products.findFirst({
    where: and(eq(schema.products.supplierId, supplierId), eq(sql`lower(${schema.products.name})`, name.toLowerCase())),
  });
  if (dup) return { error: "exists" };
  await db.insert(schema.products).values({
    supplierId, name, unit, categoryId, service, nature, priceLocked,
    price: price != null ? String(price) : null,
    priceMin: priceMin != null ? String(priceMin) : null,
  });
  refresh();
  return { ok: true };
}

/** Modification d'une cellule du mercurial. Un changement de prix est tracé dans le suivi des prix. */
export async function updateMercurialRowAction(
  id: number,
  data: { supplierId?: number; name?: string; unit?: string; price?: string; priceMin?: string; service?: string; nature?: string; priceLocked?: boolean },
) {
  const user = await assertUser(can.editMercurial);
  const db = getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) return;
  const set: Partial<typeof schema.products.$inferInsert> = {};
  if (data.supplierId) set.supplierId = data.supplierId;
  if (data.name?.trim()) set.name = data.name.trim();
  if (data.unit?.trim()) set.unit = await ensureUnit(data.unit);
  if (data.service !== undefined) set.service = data.service.trim() || null;
  if (data.priceLocked !== undefined) set.priceLocked = data.priceLocked;
  if (data.nature !== undefined) {
    set.nature = data.nature.trim() || null;
    set.categoryId = await categoryIdFor(set.nature);
  }
  if (data.priceMin !== undefined) {
    const n = num(data.priceMin);
    set.priceMin = n != null ? String(n) : null;
  }
  if (data.price !== undefined) {
    const newPrice = num(data.price);
    const old = num(product.price);
    if (newPrice != null && newPrice !== old) {
      set.price = String(newPrice);
      const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, data.supplierId ?? product.supplierId) });
      await db.insert(schema.priceChanges).values({
        supplierId: supplier?.id ?? product.supplierId,
        supplierName: supplier?.name ?? "",
        productId: id,
        productName: set.name ?? product.name,
        unit: set.unit ?? product.unit,
        oldPrice: old != null ? String(old) : null,
        newPrice: String(newPrice),
        pct: priceDiffPct(newPrice, old),
        type: old == null ? "new_product" : newPrice > old ? "increase" : "decrease",
        source: "manual",
        createdBy: user.id,
      });
    } else if (newPrice == null && data.price.trim() === "") {
      set.price = null;
    }
  }
  if (Object.keys(set).length) await db.update(schema.products).set(set).where(eq(schema.products.id, id));
  refresh();
  revalidatePath("/prices");
}

export async function setProductActiveAction(id: number, active: boolean) {
  await assertUser(can.editMercurial);
  await getDb().update(schema.products).set({ active }).where(eq(schema.products.id, id));
  refresh();
}

export async function addUnitAction(name: string) {
  await assertUser(can.editMercurial);
  await ensureUnit(name);
  refresh();
}

export async function renameUnitAction(id: number, name: string) {
  await assertUser(can.editMercurial);
  const n = unitName(name);
  if (!n) return;
  const db = getDb();
  const unit = await db.query.units.findFirst({ where: eq(schema.units.id, id) });
  if (!unit || unit.name === n) return;
  await db.transaction(async (tx) => {
    await tx.update(schema.units).set({ name: n }).where(eq(schema.units.id, id));
    await tx.update(schema.products).set({ unit: n }).where(eq(schema.products.unit, unit.name));
  });
  refresh();
}

/** Supprime une unité seulement si aucun produit du mercurial ne l'utilise */
export async function deleteUnitAction(id: number): Promise<{ error?: string }> {
  await assertUser(can.editMercurial);
  const db = getDb();
  const unit = await db.query.units.findFirst({ where: eq(schema.units.id, id) });
  if (!unit) return {};
  const used = await db.query.products.findFirst({ where: eq(schema.products.unit, unit.name), columns: { id: true } });
  if (used) return { error: "used" };
  await db.delete(schema.units).where(eq(schema.units.id, id));
  refresh();
  return {};
}
