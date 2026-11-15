import "server-only";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { nameKey } from "@/lib/search";
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
  // Fournisseurs rapprochés par nom (accents, majuscules, pluriels ignorés) ; on privilégie le plus ancien
  const allSuppliers = await db.select().from(schema.suppliers).orderBy(schema.suppliers.id);
  const suppliers = new Map<string, number>();
  for (const s of allSuppliers) if (!suppliers.has(nameKey(s.name))) suppliers.set(nameKey(s.name), s.id);
  const linked = new Map(
    (await db.select().from(schema.products).where(isNotNull(schema.products.fvItemId))).map((p) => [p.fvItemId!, p]),
  );

  for (const it of items) {
    if (!it.supplier) continue;
    let supplierId = suppliers.get(nameKey(it.supplier));
    if (!supplierId) {
      supplierId = (await db.insert(schema.suppliers).values({ name: it.supplier }).onConflictDoNothing().returning())[0]?.id;
      if (!supplierId) supplierId = (await db.query.suppliers.findFirst({ where: eq(schema.suppliers.name, it.supplier) }))!.id;
      suppliers.set(nameKey(it.supplier), supplierId);
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
  // Doublons de fournisseurs (même nom à l'accent / pluriel près) devenus vides : retirés de la liste
  for (const s of allSuppliers) {
    const main = suppliers.get(nameKey(s.name));
    if (main === s.id) continue;
    const used = await db.query.products.findFirst({ where: and(eq(schema.products.supplierId, s.id), eq(schema.products.active, true)), columns: { id: true } });
    if (!used) await db.update(schema.suppliers).set({ active: false }).where(eq(schema.suppliers.id, s.id));
  }

  // Produits dont la ligne fruits et légumes n'existe plus (ou d'une autre année) : retirés
  const ids = items.map((i) => i.id);
  await db
    .update(schema.products)
    .set({ active: false })
    .where(and(isNotNull(schema.products.fvItemId), ids.length ? notInArray(schema.products.fvItemId, ids) : undefined));
}
