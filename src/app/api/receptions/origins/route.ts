import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { receptionNos } from "@/lib/server/queries";

/** Bon de reprise : livraisons du fournisseur (6 derniers mois) et leurs produits, pour choisir la livraison d'origine */
export async function GET(req: Request) {
  try {
    await assertUser(can.receive);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const u = new URL(req.url);
  const supplierId = Number(u.searchParams.get("supplierId")) || null;
  const supplierName = (u.searchParams.get("supplierName") ?? "").trim();
  const include = Number(u.searchParams.get("include")) || null;
  if (!supplierId && !supplierName && !include) return Response.json({ deliveries: [] });
  const db = getDb();
  const r = schema.receptions;
  const since = new Date(Date.now() - 183 * 86_400_000);
  const who = supplierId ? eq(r.supplierId, supplierId) : supplierName ? sql`lower(${r.supplierName}) = ${supplierName.toLowerCase()}` : sql`false`;
  const recs = await db
    .select({ id: r.id, at: r.deliveredAt, bl: r.blNumber, supplierId: r.supplierId, supplierName: r.supplierName })
    .from(r)
    .where(and(eq(r.kind, "livraison"), sql`(${and(who, gte(r.deliveredAt, since))} or ${r.id} = ${include ?? 0})`))
    .orderBy(desc(r.deliveredAt))
    .limit(60);
  const ids = recs.map((x) => x.id);
  const l = schema.receptionLines;
  const [lines, nos] = await Promise.all([
    ids.length
      ? db.select({ receptionId: l.receptionId, productId: l.productId, name: l.productName, unit: l.unit, categoryId: l.categoryId, ordered: l.qtyOrdered, received: l.qtyReceived, refuse: l.refuseQty, ret: l.returnQty, price: l.unitPrice, lot: l.lot, reason: l.reason })
          .from(l).where(inArray(l.receptionId, ids)).orderBy(l.position)
      : Promise.resolve([]),
    receptionNos(),
  ]);
  return Response.json({
    deliveries: recs.map((x) => ({
      id: x.id, no: nos.get(x.id) ?? "—", date: x.at.toISOString(), bl: x.bl, supplierId: x.supplierId, supplierName: x.supplierName,
      lines: lines.filter((y) => y.receptionId === x.id).map((y) => ({
        productId: y.productId, name: y.name, unit: y.unit ?? "", categoryId: y.categoryId, lot: y.lot ?? "", reason: y.reason ?? "",
        // Quantité proposée : Retour / Refus saisis, sinon Q Facturée
        qty: num(y.ret) ?? num(y.refuse) ?? num(y.ordered) ?? num(y.received), price: num(y.price),
      })),
    })),
  });
}
