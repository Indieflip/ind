import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { docLabel } from "@/lib/documents";
import { receptionNos } from "@/lib/server/queries";

/**
 * Bon de reprise : livraisons du fournisseur sur une période (from / to, AAAA-MM-JJ, heure de Paris ; 6 derniers mois par défaut)
 * et leurs produits, pour choisir la ou les livraisons d'origine. Les livraisons déjà choisies (include=12,34) sont toujours renvoyées.
 */
export async function GET(req: Request) {
  try {
    await assertUser(can.receive);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const u = new URL(req.url);
  const supplierId = Number(u.searchParams.get("supplierId")) || null;
  const supplierName = (u.searchParams.get("supplierName") ?? "").trim();
  const include = (u.searchParams.get("include") ?? "").split(",").map(Number).filter((x) => Number.isInteger(x) && x > 0);
  const day = (k: string) => { const v = u.searchParams.get(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const from = day("from");
  const to = day("to");
  if (!supplierId && !supplierName && !include.length) return Response.json({ deliveries: [] });
  const db = getDb();
  const r = schema.receptions;
  const who = supplierId ? eq(r.supplierId, supplierId) : supplierName ? sql`lower(${r.supplierName}) = ${supplierName.toLowerCase()}` : sql`false`;
  const period: SQL[] = from || to
    ? [...(from ? [sql`${r.deliveredAt} >= ((${from}::date)::timestamp at time zone 'Europe/Paris')`] : []), ...(to ? [sql`${r.deliveredAt} < ((${to}::date + 1)::timestamp at time zone 'Europe/Paris')`] : [])]
    : [gte(r.deliveredAt, new Date(Date.now() - 183 * 86_400_000))];
  const inPeriod = and(who, ...period);
  const recs = await db
    .select({ id: r.id, at: r.deliveredAt, bl: r.blNumber, documents: r.documents, supplierId: r.supplierId, supplierName: r.supplierName })
    .from(r)
    .where(and(eq(r.kind, "livraison"), include.length ? sql`(${inPeriod} or ${inArray(r.id, include)})` : inPeriod))
    .orderBy(desc(r.deliveredAt))
    .limit(400);
  const ids = recs.map((x) => x.id);
  const l = schema.receptionLines;
  const [lines, nos] = await Promise.all([
    ids.length
      ? db.select({ receptionId: l.receptionId, productId: l.productId, name: l.productName, unit: l.unit, categoryId: l.categoryId, ordered: l.qtyOrdered, received: l.qtyReceived, price: l.unitPrice, lot: l.lot, reason: l.reason, document: l.document })
          .from(l).where(inArray(l.receptionId, ids)).orderBy(l.position)
      : Promise.resolve([]),
    receptionNos(),
  ]);
  const ddmmyy = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
  return Response.json({
    deliveries: recs.map((x) => {
      const docs = (x.documents as { type: string; number: string; date?: string | null }[] | null) ?? (x.bl ? [{ type: "bl", number: x.bl }] : []);
      const no = nos.get(x.id) ?? "—";
      // Référence du document d'origine d'un produit : N° de fiche · type et N° du document (avec sa date), sinon date de livraison
      const ref = (docNo?: string | null) => {
        const d = (docNo && docs.find((y) => y.number === docNo)) || docs[0];
        return d ? `${no} · ${docLabel(d)}${d.date ? "" : ` · ${ddmmyy(x.at)}`}` : `${no} · ${ddmmyy(x.at)}`;
      };
      const own = lines.filter((y) => y.receptionId === x.id);
      return {
        id: x.id, no, date: x.at.toISOString(), bl: x.bl, docs: docs.map((d) => docLabel(d)), supplierId: x.supplierId, supplierName: x.supplierName,
        total: Math.round(own.reduce((s, y) => s + (num(y.received) ?? num(y.ordered) ?? 0) * (num(y.price) ?? 0), 0) * 100) / 100,
        lines: own.map((y) => ({
          productId: y.productId, name: y.name, unit: y.unit ?? "", categoryId: y.categoryId, lot: y.lot ?? "", reason: y.reason ?? "", ref: ref(y.document),
          // Quantité proposée : quantité reçue (Q contrôlée), sinon Q facturée
          qty: num(y.received) ?? num(y.ordered), price: num(y.price),
        })),
      };
    }),
  });
}
