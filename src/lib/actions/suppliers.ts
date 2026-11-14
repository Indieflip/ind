"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";

type R = { ok?: boolean; error?: string; message?: string } | undefined;

export async function addSupplierAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.editSuppliers);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };
  await getDb().insert(schema.suppliers).values({ name }).onConflictDoNothing();
  revalidatePath("/mercurial/fournisseurs");
  return { ok: true };
}

export async function updateSupplierAction(id: number, data: { name?: string; email?: string; phone?: string; notes?: string; active?: boolean }) {
  await assertUser(can.editSuppliers);
  const set: Partial<typeof schema.suppliers.$inferInsert> = {};
  if (data.name !== undefined && data.name.trim()) set.name = data.name.trim();
  if (data.email !== undefined) set.email = data.email.trim() || null;
  if (data.phone !== undefined) set.phone = data.phone.trim() || null;
  if (data.notes !== undefined) set.notes = data.notes.trim() || null;
  if (data.active !== undefined) set.active = data.active;
  await getDb().update(schema.suppliers).set(set).where(eq(schema.suppliers.id, id));
  revalidatePath(`/mercurial/fournisseurs/${id}`);
  revalidatePath("/mercurial/fournisseurs");
}

export async function addProductAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.editSuppliers);
  const supplierId = Number(form.get("supplierId"));
  const name = String(form.get("name") ?? "").trim();
  const unit = String(form.get("unit") ?? "").trim();
  const categoryId = Number(form.get("categoryId")) || null;
  const price = num(form.get("price"));
  if (!supplierId || !name || !unit || !categoryId) return { error: "invalid" };
  await getDb().insert(schema.products).values({ supplierId, name, unit, categoryId, price: price != null ? String(price) : null });
  revalidatePath(`/mercurial/fournisseurs/${supplierId}`);
  return { ok: true };
}

export async function updateProductAction(id: number, data: { name?: string; unit?: string; categoryId?: number | null; active?: boolean }) {
  await assertUser(can.editSuppliers);
  const set: Partial<typeof schema.products.$inferInsert> = {};
  if (data.name !== undefined && data.name.trim()) set.name = data.name.trim();
  if (data.unit !== undefined && data.unit.trim()) set.unit = data.unit.trim();
  if (data.categoryId !== undefined) set.categoryId = data.categoryId;
  if (data.active !== undefined) set.active = data.active;
  const [p] = await getDb().update(schema.products).set(set).where(eq(schema.products.id, id)).returning();
  if (p) revalidatePath(`/mercurial/fournisseurs/${p.supplierId}`);
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Import « Fournisseur ; Produit ; Unité ; Catégorie ; Prix » (collage ou CSV) */
export async function importCatalogAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.editSuppliers);
  let text = String(form.get("text") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) text += "\n" + (await file.text());
  const db = getDb();
  const categories = await db.select().from(schema.categories);
  const findCat = (raw: string) => {
    const n = norm(raw);
    if (!n) return null;
    const exact = categories.find((c) => [c.code, c.nameFr, c.nameEn].some((x) => norm(x) === n));
    if (exact) return exact.id;
    const partial = categories.find((c) => [c.nameFr, c.nameEn].some((x) => norm(x).includes(n) || n.includes(norm(x).split(" ")[0])));
    return partial?.id ?? null;
  };

  let created = 0, updated = 0, skipped = 0;
  const supplierCache = new Map<string, number>();
  for (const rawLine of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sep = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    let [supplierName, productName, unit = "kg", catRaw = "", priceRaw = ""] = cols;
    // Ordre « Fournisseur ; Produit ; Unité ; Prix ; Catégorie » accepté aussi
    if (num(catRaw.replace("€", "")) != null && num(priceRaw.replace("€", "")) == null) [catRaw, priceRaw] = [priceRaw, catRaw];
    if (!supplierName || !productName || norm(supplierName) === "fournisseur" || norm(supplierName) === "supplier") { skipped++; continue; }

    let supplierId = supplierCache.get(norm(supplierName));
    if (!supplierId) {
      const s = await db.query.suppliers.findFirst({ where: eq(sql`lower(${schema.suppliers.name})`, supplierName.toLowerCase()) });
      supplierId = s?.id ?? (await db.insert(schema.suppliers).values({ name: supplierName }).returning())[0].id;
      supplierCache.set(norm(supplierName), supplierId);
    }
    if (unit) await db.insert(schema.units).values({ name: unit }).onConflictDoNothing();
    const categoryId = findCat(catRaw);
    const price = num(priceRaw.replace("€", ""));
    const existing = await db.query.products.findFirst({
      where: and(eq(schema.products.supplierId, supplierId), eq(sql`lower(${schema.products.name})`, productName.toLowerCase())),
    });
    if (existing) {
      await db.update(schema.products).set({
        unit: unit || existing.unit,
        categoryId: categoryId ?? existing.categoryId,
        ...(price != null ? { price: String(price) } : {}),
        active: true,
      }).where(eq(schema.products.id, existing.id));
      updated++;
    } else {
      await db.insert(schema.products).values({ supplierId, name: productName, unit: unit || "kg", categoryId, price: price != null ? String(price) : null });
      created++;
    }
  }
  revalidatePath("/mercurial/fournisseurs");
  return { ok: true, message: `+${created} / ~${updated} / ${skipped}` };
}
