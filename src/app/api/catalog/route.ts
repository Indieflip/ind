import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { num } from "@/lib/format";
import type { Catalog } from "@/lib/reception-types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  const [suppliers, products, categories, drivers] = await Promise.all([
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name)),
    db.select().from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    db.execute<{ supplier_id: number; driver_name: string }>(sql`
      select supplier_id, driver_name from (
        select supplier_id, driver_name, max(delivered_at) as last
        from receptions where supplier_id is not null and driver_name is not null and driver_name <> ''
        group by supplier_id, driver_name
      ) d order by last desc`),
  ]);
  const bySupplier = new Map<number, string[]>();
  for (const r of drivers.rows) {
    const list = bySupplier.get(r.supplier_id) ?? [];
    if (list.length < 5) list.push(r.driver_name);
    bySupplier.set(r.supplier_id, list);
  }
  const catalog: Catalog = {
    suppliers: suppliers.map((s) => ({ ...s, drivers: bySupplier.get(s.id) ?? [] })),
    products: products.map((p) => ({ id: p.id, supplierId: p.supplierId, name: p.name, unit: p.unit, categoryId: p.categoryId, price: num(p.price) })),
    categories: categories.map((c) => ({ id: c.id, code: c.code, nameFr: c.nameFr, nameEn: c.nameEn, tempRequired: c.tempRequired, conformMax: c.conformMax, reserveMax: c.reserveMax })),
    fetchedAt: new Date().toISOString(),
  };
  return Response.json(catalog);
}
