import "server-only";
import { and, desc, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { normalize } from "@/lib/search";

const FROM = "àâäáãåéèêëíìîïóòôöõúùûüçñ";
const TO = "aaaaaaeeeeiiiiooooouuuucn";

/** Texte des colonnes, en minuscules et sans accents, pour une recherche tolérante */
const norm = (cols: (AnyPgColumn | SQL)[]) => sql`translate(replace(replace(lower(concat_ws(' ', ${sql.join(cols, sql`, `)})), 'œ', 'oe'), 'æ', 'ae'), ${FROM}, ${TO})`;

/** Tous les mots tapés doivent se retrouver dans l'une des colonnes */
function where(cols: (AnyPgColumn | SQL)[], words: string[]) {
  const text = norm(cols);
  return and(...words.map((w) => sql`${text} like ${"%" + w + "%"}`));
}

export async function globalSearch(q: string) {
  const words = normalize(q).split(" ").filter((w) => w.length >= 2).slice(0, 6);
  if (!words.length) return null;
  const db = getDb();
  const r = schema.receptions, l = schema.receptionLines, a = schema.anomalies, w = schema.weighGaps, p = schema.products, s = schema.suppliers, m = schema.majLog, pr = schema.protocols, n = schema.receptionNotes;
  const docs = sql`coalesce(${r.documents}::text, '')`;
  const lines = sql`coalesce((select string_agg(coalesce(${l.productName}, '') || ' ' || coalesce(${l.lot}, ''), ' ') from ${l} where ${l.receptionId} = ${r.id}), '')`;
  const notes = sql`coalesce((select string_agg(${n.text}, ' ') from ${n} where ${n.receptionId} = ${r.id}), '')`;
  const [receptions, anomalies, gaps, products, suppliers, maj, protocols] = await Promise.all([
    db.select({ id: r.id, supplierName: r.supplierName, blNumber: r.blNumber, documents: r.documents, deliveredAt: r.deliveredAt, status: r.status, consolidatedAt: r.consolidatedAt })
      .from(r).where(where([r.supplierName, r.blNumber, docs, r.driverName, r.reservesText, lines, notes], words)).orderBy(desc(r.deliveredAt)).limit(50),
    db.select({ id: a.id, supplierName: a.supplierName, productName: a.productName, description: a.description, reference: a.reference, createdAt: a.createdAt, status: a.status, receptionId: a.receptionId })
      .from(a).where(where([a.supplierName, a.productName, a.description, a.reference, a.followUp, a.result, a.nature], words)).orderBy(desc(a.createdAt)).limit(50),
    db.select({ id: w.id, date: w.date, product: w.product, supplierRef: w.supplierRef, gapAmount: w.gapAmount, receptionId: w.receptionId })
      .from(w).where(where([w.product, w.supplierRef, w.detail, w.nature], words)).orderBy(desc(w.date)).limit(50),
    db.select({ id: p.id, name: p.name, unit: p.unit, price: p.price, priceMin: p.priceMin, supplierId: p.supplierId, supplier: s.name })
      .from(p).innerJoin(s, sql`${s.id} = ${p.supplierId}`).where(and(sql`${p.active}`, where([p.name, s.name, p.nature], words))).orderBy(p.name).limit(50),
    db.select({ id: s.id, name: s.name }).from(s).where(where([s.name], words)).orderBy(s.name).limit(30),
    db.select({ id: m.id, date: m.date, item: m.item, detail: m.detail, reference: m.reference })
      .from(m).where(where([m.item, m.detail, m.reference, m.nature], words)).orderBy(desc(m.date)).limit(30),
    db.select({ id: pr.id, title: pr.title }).from(pr).where(where([pr.title, pr.content], words)).limit(20),
  ]);
  return { receptions, anomalies, gaps, products, suppliers, maj, protocols };
}
