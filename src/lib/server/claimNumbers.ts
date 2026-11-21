import "server-only";
import { parisYear } from "@/lib/numbering";
import { asc, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * N° de réclamation : chaque anomalie (ou groupe d'écarts de pesée d'un bon) est une réclamation numérotée
 * par ancienneté (N° 1 = la plus ancienne, quel que soit son statut). Les nouvelles prennent la suite.
 */
export async function ensureClaimNumbers() {
  const db = getDb();
  const a = schema.anomalies;
  const todo = await db.select({ id: a.id, createdAt: a.createdAt }).from(a).where(isNull(a.claimNo)).orderBy(asc(a.createdAt), asc(a.id));
  if (!todo.length) return;
  // N° de réclamation (FDR001…) : par année de création, remise à zéro le 01/01
  const maxByYear = new Map<number, number>();
  for (const r of (await db.execute<{ y: number; m: number }>(sql`select extract(year from ${a.createdAt} at time zone 'Europe/Paris')::int as y, coalesce(max(${a.claimNo}), 0)::int as m from ${a} group by 1`)).rows) maxByYear.set(Number(r.y), Number(r.m));
  for (const r of todo) {
    const y = parisYear(r.createdAt);
    const n = (maxByYear.get(y) ?? 0) + 1;
    maxByYear.set(y, n);
    await db.execute(sql`update anomalies set claim_no = ${n} where id = ${r.id} and claim_no is null`);
  }
}
