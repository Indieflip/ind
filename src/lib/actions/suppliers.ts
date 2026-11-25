"use server";
import { natureOfCategory } from "@/lib/nature";
import { and, eq, inArray, sql } from "drizzle-orm";
import { unitName } from "@/lib/units";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";

type R = { ok?: boolean; error?: string; message?: string } | undefined;

export async function addSupplierAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.createSupplier);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };
  await getDb().insert(schema.suppliers).values({ name }).onConflictDoNothing();
  revalidatePath("/mercurial", "layout");
  return { ok: true };
}

/**
 * Suppression d'un fournisseur (administrateur). Ses produits, réceptions, anomalies et historiques
 * sont soit rattachés à un autre fournisseur (cas d'un doublon), soit détachés (les bons gardent le nom écrit).
 */
export async function deleteSupplierAction(id: number, transferTo: number | null) {
  await assertUser(can.deleteSupplier);
  const db = getDb();
  if (transferTo === id) return { error: "same" };
  await db.transaction(async (tx) => {
    const target = transferTo ? await tx.query.suppliers.findFirst({ where: eq(schema.suppliers.id, transferTo) }) : null;
    if (target) {
      await tx.update(schema.products).set({ supplierId: target.id }).where(eq(schema.products.supplierId, id));
      await tx.update(schema.receptions).set({ supplierId: target.id, supplierName: target.name }).where(eq(schema.receptions.supplierId, id));
      await tx.update(schema.anomalies).set({ supplierId: target.id, supplierName: target.name }).where(eq(schema.anomalies.supplierId, id));
      await tx.update(schema.priceChanges).set({ supplierId: target.id, supplierName: target.name }).where(eq(schema.priceChanges.supplierId, id));
      await tx.update(schema.weighGaps).set({ supplierId: target.id }).where(eq(schema.weighGaps.supplierId, id));
      await tx.update(schema.majLog).set({ supplierId: target.id }).where(eq(schema.majLog.supplierId, id));
      await tx.execute(sql`update claims set supplier_id = ${target.id}, supplier_name = ${target.name} where supplier_id = ${id}`);
    } else {
      // Sans transfert : les bons, anomalies et écarts gardent le nom écrit ; les produits du fournisseur sont retirés
      const prods = (await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.supplierId, id))).map((p) => p.id);
      if (prods.length) {
        await tx.update(schema.receptionLines).set({ productId: null }).where(inArray(schema.receptionLines.productId, prods));
        await tx.update(schema.priceChanges).set({ productId: null }).where(inArray(schema.priceChanges.productId, prods));
        await tx.delete(schema.products).where(inArray(schema.products.id, prods));
      }
      await tx.update(schema.receptions).set({ supplierId: null }).where(eq(schema.receptions.supplierId, id));
      await tx.update(schema.anomalies).set({ supplierId: null }).where(eq(schema.anomalies.supplierId, id));
      await tx.update(schema.priceChanges).set({ supplierId: null }).where(eq(schema.priceChanges.supplierId, id));
      await tx.execute(sql`update claims set supplier_id = null where supplier_id = ${id}`);
    }
    await tx.delete(schema.suppliers).where(eq(schema.suppliers.id, id));
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateSupplierAction(
  id: number,
  data: { name?: string; email?: string; phone?: string; notes?: string; active?: boolean; contacts?: Record<string, { email?: string; phone?: string; notes?: string; extra?: { label: string; value: string }[] }>; claimProcess?: string },
) {
  await assertUser(can.editSuppliers);
  const set: Partial<typeof schema.suppliers.$inferInsert> = {};
  if (data.name !== undefined && data.name.trim()) set.name = data.name.trim();
  if (data.email !== undefined) set.email = data.email.trim() || null;
  if (data.phone !== undefined) set.phone = data.phone.trim() || null;
  if (data.notes !== undefined) set.notes = data.notes.trim() || null;
  if (data.active !== undefined) set.active = data.active;
  if (data.contacts !== undefined) {
    // Coordonnées par usage ; celles de la société restent aussi dans les champs mail / téléphone / notes
    const clean = Object.fromEntries(
      (["societe", "reclamation", "commande"] as const).map((k) => {
        const c = data.contacts?.[k] ?? {};
        const extra = (c.extra ?? []).map((x) => ({ label: x.label.trim(), value: x.value.trim() })).filter((x) => (["email", "phone", "notes"].includes(x.label) ? x.value : x.label || x.value));
        return [k, { email: c.email?.trim() || undefined, phone: c.phone?.trim() || undefined, notes: c.notes?.trim() || undefined, extra: extra.length ? extra : undefined }];
      }),
    );
    set.contacts = clean;
    set.email = clean.societe.email ?? null;
    set.phone = clean.societe.phone ?? null;
    set.notes = clean.societe.notes ?? null;
  }
  if (data.claimProcess !== undefined) set.claimProcess = data.claimProcess.trim() || null;
  await getDb().update(schema.suppliers).set(set).where(eq(schema.suppliers.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
  revalidatePath("/mercurial", "layout");
}

export async function addProductAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.editSuppliers);
  const supplierId = Number(form.get("supplierId"));
  const name = String(form.get("name") ?? "").trim();
  const unit = String(form.get("unit") ?? "").trim();
  const categoryId = Number(form.get("categoryId")) || null;
  const price = num(form.get("price"));
  if (!supplierId || !name || !unit || !categoryId) return { error: "invalid" };
  const code = (await getDb().query.categories.findFirst({ where: eq(schema.categories.id, categoryId) }))?.code;
  await getDb().insert(schema.products).values({ supplierId, name, unit, categoryId, nature: natureOfCategory(code), price: price != null ? String(price) : null });
  revalidatePath("/mercurial", "layout");
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
  if (p) revalidatePath("/mercurial", "layout");
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
    unit = unitName(unit);
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
      const code = categoryId ? (await db.query.categories.findFirst({ where: eq(schema.categories.id, categoryId) }))?.code : null;
      await db.insert(schema.products).values({ supplierId, name: productName, unit: unit || "kg", categoryId, nature: natureOfCategory(code), price: price != null ? String(price) : null });
      created++;
    }
  }
  revalidatePath("/mercurial", "layout");
  return { ok: true, message: `+${created} / ~${updated} / ${skipped}` };
}
