import "server-only";
import { and, desc, eq, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Bornes de période (dates AAAA-MM-JJ, heure de Paris) */
export function dateRange(column: AnyColumn | SQL, from?: string, to?: string) {
  const conds: SQL[] = [];
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) conds.push(sql`${column} >= ((${from}::date)::timestamp at time zone 'Europe/Paris')`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) conds.push(sql`${column} < ((${to}::date + 1)::timestamp at time zone 'Europe/Paris')`);
  return conds;
}

export interface ReceptionFilters { from?: string; to?: string; supplier?: string; status?: string }

export function receptionFilters(sp: SP): ReceptionFilters {
  return { from: one(sp.from), to: one(sp.to), supplier: one(sp.supplier), status: one(sp.status) };
}

export function receptionWhere(f: ReceptionFilters) {
  const r = schema.receptions;
  const conds: SQL[] = [...dateRange(r.deliveredAt, f.from, f.to)];
  if (f.supplier && /^\d+$/.test(f.supplier)) conds.push(eq(r.supplierId, Number(f.supplier)));
  if (f.status && ["conform", "with_reserves", "partial_refusal", "refused"].includes(f.status)) {
    conds.push(eq(r.status, f.status as "conform"));
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listReceptions(f: ReceptionFilters, limit = 300) {
  const r = schema.receptions;
  return getDb()
    .select({
      id: r.id,
      deliveredAt: r.deliveredAt,
      supplierName: r.supplierName,
      blNumber: r.blNumber,
      status: r.status,
      driverName: r.driverName,
      lineCount: sql<number>`(select count(*)::int from reception_lines l where l.reception_id = ${r.id})`,
      createdByName: schema.users.name,
    })
    .from(r)
    .leftJoin(schema.users, eq(schema.users.id, r.createdBy))
    .where(receptionWhere(f))
    .orderBy(desc(r.deliveredAt))
    .limit(limit);
}

export async function supplierOptions() {
  return getDb().select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).orderBy(schema.suppliers.name);
}
