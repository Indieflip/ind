import "server-only";
import { parisYear, recNo } from "@/lib/numbering";
import { and, desc, eq, isNotNull, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { matches } from "@/lib/search";
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

export interface ReceptionFilters { from?: string; to?: string; supplier?: string; status?: string; bl?: string; state?: string }

export function receptionFilters(sp: SP): ReceptionFilters {
  return { from: one(sp.from), to: one(sp.to), supplier: one(sp.supplier), status: one(sp.status), bl: one(sp.bl), state: one(sp.state) };
}

export function receptionWhere(f: ReceptionFilters) {
  const r = schema.receptions;
  const conds: SQL[] = [...dateRange(r.deliveredAt, f.from, f.to)];
  if (f.supplier && /^\d+$/.test(f.supplier)) conds.push(eq(r.supplierId, Number(f.supplier)));
  if (f.status && ["conform", "with_reserves", "partial_refusal", "refused"].includes(f.status)) {
    conds.push(eq(r.status, f.status as "conform"));
  }
  if (f.state === "pending") conds.push(isNull(r.consolidatedAt));
  if (f.state === "consolidated") conds.push(isNotNull(r.consolidatedAt));
  return conds.length ? and(...conds) : undefined;
}

/**
 * N° de fiche de réception (RCP001…) par année de livraison, remise à zéro le 01/01 : numéro enregistré (attribué par date de livraison),
 * les nouvelles fiches prennent la suite dans l'ordre d'enregistrement. Les bons de reprise (BR001…) ont leur propre suite.
 */
export async function receptionNumbers() {
  return (await receptionNumbering()).numbers;
}

/** N° affichés (« RCP012 », « BR003 ») de toutes les fiches, livraisons et bons de reprise */
export async function receptionNos() {
  const { numbers, kinds } = await receptionNumbering();
  return new Map([...numbers].map(([id, n]) => [id, recNo(kinds.get(id), n)] as [number, string]));
}

async function receptionNumbering() {
  const rows = await getDb().select({ id: schema.receptions.id, at: schema.receptions.deliveredAt, seq: schema.receptions.seq, kind: schema.receptions.kind }).from(schema.receptions).orderBy(schema.receptions.id);
  const maxByYear = new Map<string, number>();
  const key = (r: (typeof rows)[number]) => `${r.kind}|${parisYear(r.at)}`;
  for (const r of rows) if (r.seq != null) maxByYear.set(key(r), Math.max(maxByYear.get(key(r)) ?? 0, r.seq));
  const numbers = new Map(rows.map((r) => {
    if (r.seq != null) return [r.id, r.seq] as [number, number];
    const n = (maxByYear.get(key(r)) ?? 0) + 1; maxByYear.set(key(r), n);
    return [r.id, n] as [number, number];
  }));
  return { numbers, kinds: new Map(rows.map((r) => [r.id, r.kind])) };
}

export async function listReceptions(f: ReceptionFilters, limit = 1000) {
  const [rows, numbers] = await Promise.all([listRaw(f, limit), receptionNumbers()]);
  return rows
    .map((x) => ({ ...x, number: numbers.get(x.id) ?? 0 }))
    .filter((x) => !f.bl || matches(x.blNumber ?? "", f.bl));
}

function listRaw(f: ReceptionFilters, limit: number) {
  const r = schema.receptions;
  return getDb()
    .select({
      id: r.id,
      deliveredAt: r.deliveredAt,
      supplierName: r.supplierName,
      blNumber: r.blNumber,
      documents: r.documents,
      status: r.status,
      driverName: r.driverName,
      consolidatedAt: r.consolidatedAt,
      importedFrom: r.importedFrom,
      kind: r.kind,
      lineCount: sql<number>`(select count(*)::int from reception_lines l where l.reception_id = ${r.id})`,
      // Produits non rattachés au Mercurial (à trier sur les anciennes fiches)
      unlinkedCount: sql<number>`(select count(*)::int from reception_lines l where l.reception_id = ${r.id} and l.product_id is null)`,
      anomalyCount: sql<number>`(select count(*)::int from anomalies a where a.reception_id = ${r.id})`,
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

/** Catégories (formulaires d'ajout de produit), rangées de A à Z */
export async function categoryOptions(locale = "fr") {
  const rows = await getDb().select({ id: schema.categories.id, nameFr: schema.categories.nameFr, nameEn: schema.categories.nameEn }).from(schema.categories);
  return rows.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr })).sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}
