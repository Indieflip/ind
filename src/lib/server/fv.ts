import "server-only";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { normalize } from "@/lib/search";
import { unitName } from "@/lib/units";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Les produits de l'onglet Fruits et légumes (année en cours) deviennent des produits de leur
 * prestataire : ils sont proposés pendant la saisie des bons et comparés au prix du mois.
 * Ils n'apparaissent pas dans Mercurial > Produits (ils se gèrent dans Fruits et légumes).
 */
export async function syncFvProducts(tx?: Tx) {
  const db = tx ?? getDb();
  const year = new Date().getFullYear();
  const items = await db.select().from(schema.fvItems).where(eq(schema.fvItems.year, year));
  const produce = await db.query.categories.findFirst({ where: eq(schema.categories.code, "produce") });
  const suppliers = new Map((await db.select().from(schema.suppliers)).map((s) => [normalize(s.name), s.id]));
  const linked = new Map(
    (await db.select().from(schema.products).where(isNotNull(schema.products.fvItemId))).map((p) => [p.fvItemId!, p]),
  );

  for (const it of items) {
    if (!it.supplier) continue;
    let supplierId = suppliers.get(normalize(it.supplier));
    if (!supplierId) {
      supplierId = (await db.insert(schema.suppliers).values({ name: it.supplier }).onConflictDoNothing().returning())[0]?.id;
      if (!supplierId) supplierId = (await db.query.suppliers.findFirst({ where: eq(schema.suppliers.name, it.supplier) }))!.id;
      suppliers.set(normalize(it.supplier), supplierId);
    }
    const values = {
      supplierId,
      name: it.product,
      unit: unitName(it.unit) || "Kg",
      nature: "Fruits & légumes",
      categoryId: produce?.id ?? null,
      priceLocked: it.locked,
      active: true,
      fvItemId: it.id,
    };
    const p = linked.get(it.id);
    if (p) await db.update(schema.products).set(values).where(eq(schema.products.id, p.id));
    else await db.insert(schema.products).values(values);
  }
  // Produits dont la ligne fruits et légumes n'existe plus (ou d'une autre année) : retirés
  const ids = items.map((i) => i.id);
  await db
    .update(schema.products)
    .set({ active: false })
    .where(and(isNotNull(schema.products.fvItemId), ids.length ? notInArray(schema.products.fvItemId, ids) : undefined));
}
