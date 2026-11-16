import "server-only";
import { and, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dateRange, one, type SP } from "./queries";

export interface PriceFilters { from?: string; to?: string; supplier?: string; type?: string; unclaimed?: string }

export const priceFilters = (sp: SP): PriceFilters => ({
  from: one(sp.from), to: one(sp.to), supplier: one(sp.supplier), type: one(sp.type), unclaimed: one(sp.unclaimed),
});

export function priceWhere(f: PriceFilters) {
  const p = schema.priceChanges;
  const conds: SQL[] = [...dateRange(p.date, f.from, f.to)];
  if (f.supplier && /^\d+$/.test(f.supplier)) conds.push(eq(p.supplierId, Number(f.supplier)));
  if (f.type && ["increase", "decrease", "new_product"].includes(f.type)) conds.push(eq(p.type, f.type as "increase"));
  else conds.push(ne(p.type, "new_product")); // les rajouts produits du mercurial ne sont pas des variations de prix
  if (f.unclaimed) {
    conds.push(eq(p.type, "increase"));
    conds.push(or(isNull(p.claim), eq(sql`trim(${p.claim})`, ""))!);
  }
  return conds.length ? and(...conds) : undefined;
}

export function listPriceChanges(f: PriceFilters, limit = 500) {
  return getDb().select().from(schema.priceChanges).where(priceWhere(f)).orderBy(desc(schema.priceChanges.date), desc(schema.priceChanges.id)).limit(limit);
}

export interface PriceRecapRow { supplierId: number | null; supplier: string; increases: number; avgIncrease: number | null; maxIncrease: number | null; unclaimed: number; decreases: number; avgDecrease: number | null }

/** Récapitulatif par fournisseur des variations de prix (hors rajouts produits), pour justifier les chiffres du Reporting */
export async function priceRecap(f: PriceFilters): Promise<PriceRecapRow[]> {
  const p = schema.priceChanges;
  const unclaimed = sql`(${p.claim} is null or trim(${p.claim}) = '')`;
  const rows = await getDb()
    .select({
      supplierId: sql<number | null>`max(${p.supplierId})`,
      supplier: p.supplierName,
      increases: sql<number>`count(*) filter (where ${p.type} = 'increase')::int`,
      avgIncrease: sql<number | null>`avg(${p.pct}) filter (where ${p.type} = 'increase')`,
      maxIncrease: sql<number | null>`max(${p.pct}) filter (where ${p.type} = 'increase')`,
      unclaimed: sql<number>`count(*) filter (where ${p.type} = 'increase' and ${unclaimed})::int`,
      decreases: sql<number>`count(*) filter (where ${p.type} = 'decrease')::int`,
      avgDecrease: sql<number | null>`avg(${p.pct}) filter (where ${p.type} = 'decrease')`,
    })
    .from(p)
    .where(priceWhere({ ...f, supplier: undefined, type: undefined, unclaimed: undefined }))
    .groupBy(p.supplierName)
    .orderBy(sql`count(*) filter (where ${p.type} = 'increase') desc`, p.supplierName);
  return rows.map((r) => ({ ...r, avgIncrease: r.avgIncrease == null ? null : Number(r.avgIncrease), maxIncrease: r.maxIncrease == null ? null : Number(r.maxIncrease), avgDecrease: r.avgDecrease == null ? null : Number(r.avgDecrease) }));
}
