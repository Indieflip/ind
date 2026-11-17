"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";

const admin = (r: string) => r === "admin";
const refresh = () => { revalidatePath("/protocoles"); revalidatePath("/api/catalog"); };
const numOrNull = (v: string | number | null | undefined) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", ".").replace("−", "-"));
  return Number.isFinite(n) ? n : null;
};

/** Reporte le seuil d'une classe sur les catégories qui l'appliquent (moteur des décisions à la réception) */
async function syncCategories(classId: number) {
  const k = await getDb().query.tempClasses.findFirst({ where: eq(schema.tempClasses.id, classId) });
  if (k) await getDb().update(schema.categories).set({ conformMax: k.maxTemp, reserveMax: k.reserveMax }).where(eq(schema.categories.tempClassId, classId));
}

export async function saveTempClassAction(id: number | null, data: { label: string; maxTemp: string; reserveMax: string }) {
  await assertUser(admin);
  const maxTemp = numOrNull(data.maxTemp);
  if (!data.label.trim() || maxTemp == null) return { error: "invalid" };
  const values = { label: data.label.trim(), maxTemp, reserveMax: numOrNull(data.reserveMax) };
  const db = getDb();
  if (id) {
    await db.update(schema.tempClasses).set(values).where(eq(schema.tempClasses.id, id));
    await syncCategories(id);
  } else {
    const all = await db.select({ id: schema.tempClasses.id }).from(schema.tempClasses);
    await db.insert(schema.tempClasses).values({ ...values, position: all.length });
  }
  refresh();
  return { ok: true };
}

export async function deleteTempClassAction(id: number) {
  await assertUser(admin);
  await getDb().update(schema.categories).set({ tempClassId: null }).where(eq(schema.categories.tempClassId, id));
  await getDb().delete(schema.tempClasses).where(eq(schema.tempClasses.id, id));
  refresh();
  return { ok: true };
}

/** Catégorie : classe de température appliquée (ou aucune : pas de relevé obligatoire) */
export async function setCategoryClassAction(categoryId: number, classId: number | null) {
  await assertUser(admin);
  const db = getDb();
  if (!classId) {
    await db.update(schema.categories).set({ tempClassId: null, tempRequired: false, conformMax: null, reserveMax: null }).where(eq(schema.categories.id, categoryId));
  } else {
    const k = await db.query.tempClasses.findFirst({ where: eq(schema.tempClasses.id, classId) });
    if (!k) return { error: "invalid" };
    await db.update(schema.categories).set({ tempClassId: k.id, tempRequired: true, conformMax: k.maxTemp, reserveMax: k.reserveMax }).where(eq(schema.categories.id, categoryId));
  }
  refresh();
  return { ok: true };
}
