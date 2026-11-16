import "server-only";
import { asc, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * N° de réclamation : chaque anomalie (ou groupe d'écarts de pesée d'un bon) est une réclamation numérotée
 * par ancienneté (N° 1 = la plus ancienne, quel que soit son statut). Les nouvelles prennent la suite.
 */
export async function ensureClaimNumbers() {
  const db = getDb();
  const a = schema.anomalies;
  const todo = await db.select({ id: a.id }).from(a).where(isNull(a.claimNo)).orderBy(asc(a.createdAt), asc(a.id));
  if (!todo.length) return;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${a.claimNo}), 0)::int` }).from(a);
  let n = max;
  for (const r of todo) await db.execute(sql`update anomalies set claim_no = ${++n} where id = ${r.id} and claim_no is null`);
}
