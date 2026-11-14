import "server-only";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
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
  if (f.unclaimed) {
    conds.push(eq(p.type, "increase"));
    conds.push(or(isNull(p.claim), eq(sql`trim(${p.claim})`, ""))!);
  }
  return conds.length ? and(...conds) : undefined;
}

export function listPriceChanges(f: PriceFilters, limit = 500) {
  return getDb().select().from(schema.priceChanges).where(priceWhere(f)).orderBy(desc(schema.priceChanges.date), desc(schema.priceChanges.id)).limit(limit);
}
