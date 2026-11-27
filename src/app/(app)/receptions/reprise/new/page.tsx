import { and, desc, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDict } from "@/lib/i18n/server";
import { num } from "@/lib/format";
import { receptionNumbers } from "@/lib/server/queries";
import { problemTypes } from "@/lib/server/problemTypes";
import { BackLink } from "@/components/BackLink";
import { ReturnSlipForm, type Delivery } from "./ReturnSlipForm";

/** Bon de reprise / retour : on part de la livraison d'origine (6 derniers mois) */
export default async function NewReturnSlipPage({ searchParams }: { searchParams: Promise<{ reception?: string }> }) {
  await requireUser(can.receive);
  const { t } = await getDict();
  const db = getDb();
  const r = schema.receptions;
  const since = new Date(Date.now() - 183 * 86_400_000);
  const recs = await db.select({ id: r.id, at: r.deliveredAt, supplierName: r.supplierName, bl: r.blNumber }).from(r).where(gte(r.deliveredAt, since)).orderBy(desc(r.deliveredAt));
  const ids = recs.map((x) => x.id);
  const [lines, anos, numbers, types] = await Promise.all([
    ids.length ? db.select({ id: schema.receptionLines.id, receptionId: schema.receptionLines.receptionId, name: schema.receptionLines.productName, unit: schema.receptionLines.unit, qty: schema.receptionLines.qtyOrdered, received: schema.receptionLines.qtyReceived, price: schema.receptionLines.unitPrice }).from(schema.receptionLines).where(inArray(schema.receptionLines.receptionId, ids)).orderBy(schema.receptionLines.position) : Promise.resolve([]),
    ids.length ? db.select({ receptionId: schema.anomalies.receptionId, n: sql<number>`count(*)::int` }).from(schema.anomalies).where(and(inArray(schema.anomalies.receptionId, ids), inArray(schema.anomalies.stage, ["a_traiter", "en_attente", "reclamee", "a_verifier"]))).groupBy(schema.anomalies.receptionId) : Promise.resolve([]),
    receptionNumbers(),
    problemTypes(Object.entries(t.anomalies.types).filter(([k]) => k !== "quantity").map(([, v]) => v)),
  ]);
  const open = new Map(anos.map((a) => [a.receptionId, a.n]));
  const deliveries: Delivery[] = recs.map((x) => ({
    id: x.id, no: numbers.get(x.id) ?? 0, date: x.at.toISOString(), supplier: x.supplierName, bl: x.bl, openAnomalies: open.get(x.id) ?? 0,
    lines: lines.filter((l) => l.receptionId === x.id).map((l) => ({ id: l.id, name: l.name, unit: l.unit ?? "", qty: num(l.qty) ?? num(l.received), price: num(l.price) })),
  })).filter((d) => d.lines.length);
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <BackLink href="/receptions" label={t.nav.receptions} />
      <h1 className="text-xl font-bold">↩ {t.returnSlip.title}</h1>
      <ReturnSlipForm deliveries={deliveries} reasons={types} preselect={Number(sp.reception) || null} />
    </div>
  );
}
