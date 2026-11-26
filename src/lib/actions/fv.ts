"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { syncFvProducts } from "@/lib/server/fv";
import { unitName } from "@/lib/units";
import { parisMonth } from "@/lib/pricing";

/** Unité rattachée à la liste des unités (créée si nouvelle) */
async function unitOf(u: string) {
  const n = unitName(u);
  if (n) await getDb().insert(schema.units).values({ name: n }).onConflictDoNothing();
  return n || null;
}

export async function updateFvAction(id: number, data: { supplier?: string; product?: string; unit?: string; blocked?: string; locked?: boolean; prices?: (string | null)[] }) {
  await assertUser(can.editFv);
  const set: Partial<typeof schema.fvItems.$inferInsert> = {};
  if (data.supplier !== undefined) set.supplier = data.supplier.trim();
  if (data.product?.trim()) set.product = data.product.trim();
  if (data.unit !== undefined) set.unit = await unitOf(data.unit);
  if (data.blocked !== undefined) set.blocked = data.blocked.trim() || null;
  if (data.locked !== undefined) set.locked = data.locked;
  if (data.prices) set.prices = Array.from({ length: 24 }, (_, i) => num(data.prices![i] ?? null));
  await getDb().update(schema.fvItems).set(set).where(eq(schema.fvItems.id, id));
  if (data.supplier !== undefined || data.product || data.unit !== undefined || data.locked !== undefined) await syncFvProducts(undefined, [id]);
  revalidatePath("/mercurial/fruits-legumes");
  revalidatePath("/mercurial", "layout");
}

export async function addFvAction(_p: { ok?: boolean; error?: string } | undefined, form: FormData) {
  await assertUser(can.editFv);
  const supplier = String(form.get("supplier") ?? "").trim();
  const product = String(form.get("product") ?? "").trim();
  const year = Number(form.get("year"));
  if (!supplier || !product || !year) return { error: "invalid" };
  // Prix du mois en cours (− / +) saisis à l'ajout ; un seul renseigné : il vaut pour les deux
  const prices: (number | null)[] = Array(24).fill(null);
  const pMin = num(form.get("priceMin") as string | null), pMax = num(form.get("priceMax") as string | null);
  const m = parisMonth(new Date());
  prices[m * 2] = pMin ?? pMax;
  prices[m * 2 + 1] = pMax ?? pMin;
  await getDb().insert(schema.fvItems).values({ supplier, product, unit: await unitOf(String(form.get("unit") ?? "")), year, prices, position: 100000, locked: form.get("locked") === "on" });
  await syncFvProducts();
  revalidatePath("/mercurial/fruits-legumes");
  return { ok: true };
}

export async function deleteFvAction(id: number) {
  await assertUser(can.editFv);
  await getDb().delete(schema.fvItems).where(eq(schema.fvItems.id, id));
  await syncFvProducts();
  revalidatePath("/mercurial/fruits-legumes");
}
