"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { BAKERY_ITEMS, setSetting } from "@/lib/settings";

/** Ligne saisie à la main (jour sans bon dans l'application) */
export async function addBakeryRowAction(_p: { ok?: boolean; error?: string } | undefined, form: FormData) {
  await assertUser(can.editMercurial);
  const date = String(form.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "invalid" };
  const v = (k: string) => {
    const n = num(form.get(k));
    return n != null ? String(n) : null;
  };
  await getDb().insert(schema.bakeryEntries).values({ date, baguette: v("baguette"), hamburger: v("hamburger"), rolls: v("rolls"), painDeMie: v("painDeMie") });
  revalidatePath("/mercurial/boulangerie");
  return { ok: true };
}

export async function deleteBakeryRowAction(id: number) {
  await assertUser(can.editMercurial);
  // Seules les lignes saisies à la main se suppriment ici ; celles d'un bon se corrigent sur le bon
  await getDb().delete(schema.bakeryEntries).where(and(eq(schema.bakeryEntries.id, id), isNull(schema.bakeryEntries.receptionId)));
  revalidatePath("/mercurial/boulangerie");
}

export async function setBakeryPriceAction(item: string, value: string) {
  await assertUser(can.editMercurial);
  if (!(BAKERY_ITEMS as readonly string[]).includes(item)) return;
  const n = num(value);
  await setSetting(`bakery_price_${item}`, n != null ? String(n) : "");
  revalidatePath("/mercurial/boulangerie");
}

export async function setBakerySupplierAction(name: string) {
  await assertUser(can.editMercurial);
  if (name.trim()) await setSetting("bakery_supplier", name.trim());
  revalidatePath("/mercurial/boulangerie");
}
