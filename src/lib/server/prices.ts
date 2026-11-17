import "server-only";
import { and, asc, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
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

/**
 * Lignes du Suivi des prix avec leur N° (ordre chronologique de toutes les variations, rajouts produits exclus)
 * et le document : référence saisie, sinon BL / facture de la réception.
 */
export async function listPriceChanges(f: PriceFilters, limit = 2000) {
  const p = schema.priceChanges;
  const db = getDb();
  const [rows, order] = await Promise.all([
    db
      .select({ p, documents: schema.receptions.documents, blNumber: schema.receptions.blNumber })
      .from(p)
      .leftJoin(schema.receptions, eq(schema.receptions.id, p.receptionId))
      .where(priceWhere(f))
      .orderBy(desc(p.date), desc(p.id))
      .limit(limit),
    db.select({ id: p.id }).from(p).where(ne(p.type, "new_product")).orderBy(asc(p.date), asc(p.id)),
  ]);
  const numbers = new Map(order.map((o, i) => [o.id, i + 1]));
  return rows.map(({ p: r, documents, blNumber }) => {
    const docs = (documents as { type: string; number: string }[] | null) ?? [];
    const recDoc = docs.length
      ? docs.map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc." : "BL"} ${d.number}`).join(" · ")
      : blNumber ? `BL ${blNumber}` : null;
    return { ...r, number: numbers.get(r.id) ?? null, document: r.invoiceRef || recDoc || null };
  });
}

/** Nombre de hausses et de baisses par mois sur 12 mois (rajouts produits exclus) */
export async function priceMonthly(endMonth: string, supplier?: string) {
  const p = schema.priceChanges;
  const bySupplier = supplier && /^\d+$/.test(supplier) ? sql`and ${p.supplierId} = ${Number(supplier)}` : sql``;
  const res = await getDb().execute<{ month: string; increases: number; decreases: number }>(sql`
    with m as (select generate_series((${endMonth + "-01"}::date - interval '11 months'), ${endMonth + "-01"}::date, interval '1 month') as m)
    select to_char(m.m, 'YYYY-MM') as month,
      count(${p.id}) filter (where ${p.type} = 'increase')::int as increases,
      count(${p.id}) filter (where ${p.type} = 'decrease')::int as decreases
    from m left join ${p} on date_trunc('month', ${p.date} at time zone 'Europe/Paris') = m.m ${bySupplier}
    group by m.m order by m.m`);
  return res.rows;
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
