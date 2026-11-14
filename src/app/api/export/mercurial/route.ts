import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dictFor } from "@/lib/i18n";
import { csvResponse, num } from "@/lib/format";

/** Export du mercurial au format réimportable : Fournisseur ; Produit ; Unité ; Catégorie ; Prix */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !can.viewMercurial(user.role)) return new Response("Forbidden", { status: 403 });
  const t = dictFor(user.locale);
  const sp = new URL(req.url).searchParams;
  const p = schema.products;
  const s = schema.suppliers;
  const conds: SQL[] = [eq(p.active, true)];
  const supplier = sp.get("supplier");
  const q = sp.get("q")?.trim();
  if (supplier && /^\d+$/.test(supplier)) conds.push(eq(p.supplierId, Number(supplier)));
  if (q) conds.push(sql`(${p.name} ilike ${"%" + q + "%"} or ${s.name} ilike ${"%" + q + "%"})`);
  const rows = await getDb()
    .select({ supplier: s.name, name: p.name, unit: p.unit, price: p.price, catFr: schema.categories.nameFr, catEn: schema.categories.nameEn })
    .from(p)
    .innerJoin(s, eq(s.id, p.supplierId))
    .leftJoin(schema.categories, eq(schema.categories.id, p.categoryId))
    .where(and(...conds))
    .orderBy(asc(s.name), asc(p.name));
  return csvResponse(`mercurial-${new Date().toISOString().slice(0, 10)}.csv`, [
    [t.common.supplier, t.common.product, t.common.unit, t.common.category, t.mercurial.priceHt],
    ...rows.map((r) => [r.supplier, r.name, r.unit, user.locale === "en" ? r.catEn : r.catFr, num(r.price)]),
  ]);
}
