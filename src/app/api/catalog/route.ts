import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { num } from "@/lib/format";
import { fvRange, parisMonth } from "@/lib/pricing";
import { REASONS, type Catalog } from "@/lib/reception-types";
import { getBakerySupplier } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  const [suppliers, products, categories, drivers, units] = await Promise.all([
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name)),
    db.select().from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    db.execute<{ supplier_id: number; driver_name: string }>(sql`
      select supplier_id, driver_name from (
        select supplier_id, driver_name, max(delivered_at) as last
        from receptions where supplier_id is not null and driver_name is not null and driver_name <> ''
        group by supplier_id, driver_name
      ) d order by last desc`),
    db.select({ name: schema.units.name }).from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
  ]);
  // Fruits et légumes : prix du mois en cours
  const month = parisMonth(new Date());
  const fvById = new Map((await db.select().from(schema.fvItems)).map((f) => [f.id, f]));
  const bySupplier = new Map<number, string[]>();
  for (const r of drivers.rows) {
    const list = bySupplier.get(r.supplier_id) ?? [];
    if (list.length < 5) list.push(r.driver_name);
    bySupplier.set(r.supplier_id, list);
  }
  const catalog: Catalog = {
    suppliers: suppliers.map((s) => ({ ...s, drivers: bySupplier.get(s.id) ?? [] })),
    products: products.map((p) => {
      const fv = p.fvItemId ? fvById.get(p.fvItemId) : undefined;
      const range = fv ? fvRange(fv.prices, month) : { min: num(p.priceMin), max: num(p.price) };
      return { id: p.id, supplierId: p.supplierId, name: p.name, unit: p.unit, categoryId: p.categoryId, priceMin: range.min, price: range.max, locked: fv ? fv.locked : p.priceLocked };
    }),
    categories: categories.map((c) => ({ id: c.id, code: c.code, nameFr: c.nameFr, nameEn: c.nameEn, tempRequired: c.tempRequired, conformMax: c.conformMax, reserveMax: c.reserveMax })),
    units: units.map((u) => u.name),
    bakerySupplier: await getBakerySupplier(),
    // Motifs ajoutés (liste enregistrée + motifs déjà saisis hors liste de base)
    reasons: await (async () => {
      let saved: string[] = [];
      try { saved = JSON.parse((await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, "refusal_reasons_extra") }))?.value ?? "[]"); } catch { /* liste vide */ }
      const used = (await db.execute<{ reason: string }>(sql`select distinct reason from reception_lines where reason is not null and reason <> ''`)).rows.map((r) => r.reason);
      return [...new Set([...saved, ...used])].filter((r) => !(REASONS as readonly string[]).includes(r));
    })(),
    fetchedAt: new Date().toISOString(),
  };
  return Response.json(catalog);
}
