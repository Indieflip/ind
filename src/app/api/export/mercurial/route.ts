import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { matches } from "@/lib/search";
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
  const conds: SQL[] = [eq(p.active, true), isNull(p.fvItemId)];
  const supplier = sp.get("supplier");
  const q = sp.get("q")?.trim();
  if (supplier && /^\d+$/.test(supplier)) conds.push(eq(p.supplierId, Number(supplier)));
  const nature = sp.get("nature");
  const rows = await getDb()
    .select({ supplier: s.name, priceLocked: p.priceLocked, nature: p.nature, name: p.name, unit: p.unit, priceMin: p.priceMin, price: p.price })
    .from(p)
    .innerJoin(s, eq(s.id, p.supplierId))
    .where(and(...conds))
    .orderBy(asc(s.name), asc(p.name));
  const m = t.mercurial;
  // Mêmes colonnes que le fichier Excel : Fournisseur | Service | Nature | Produits | Unite | - | +
  return csvResponse(`mercurial-${new Date().toISOString().slice(0, 10)}.csv`, [
    [t.common.supplier, m.nature, m.products, t.common.unit, m.priceMin, m.priceMax, m.locked],
    ...rows
      .filter((r) => !q || matches(`${r.name} ${r.supplier}`, q))
      .filter((r) => !nature || (r.nature ?? "").split(/,\s*/).includes(nature))
      .map((r) => [r.supplier, r.nature, r.name, r.unit, num(r.priceMin), num(r.price), r.priceLocked ? t.common.yes : ""]),
  ]);
}
