import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, num } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { syncClaims } from "@/lib/server/claims";
import { one, type SP } from "@/lib/server/queries";
import { ClaimsBoard } from "./ClaimsClient";

/** Anomalies > Réclamations : réclamations auprès des fournisseurs (En cours, Clôturée, Annulée) */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  await syncClaims();
  const c = schema.claims;
  const db = getDb();
  const fromAnomaly = Number(one((await searchParams).anomaly)) || null;
  const an = fromAnomaly ? await db.query.anomalies.findFirst({ where: eq(schema.anomalies.id, fromAnomaly) }) : undefined;
  // N° des anomalies (définitif ou provisoire) pour la colonne Origine
  const anNums = await db.select({ id: schema.anomalies.id, number: schema.anomalies.number, consolidatedAt: schema.anomalies.consolidatedAt, createdAt: schema.anomalies.createdAt }).from(schema.anomalies);
  const maxNum = anNums.reduce((m, x) => Math.max(m, x.number ?? 0), 0);
  const numbers = new Map<number, number>(anNums.filter((x) => x.number).map((x) => [x.id, x.number!]));
  anNums.filter((x) => !x.number).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id - y.id).forEach((x, i) => numbers.set(x.id, maxNum + i + 1));
  const [rows, suppliers] = await Promise.all([
    db.select({ c, supplier: schema.suppliers.name }).from(c).leftJoin(schema.suppliers, eq(schema.suppliers.id, c.supplierId)).orderBy(desc(c.date), desc(c.id)),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name)),
  ]);
  return (
    <>
      <PageHeader title={t.claims.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{t.claims.intro}</p>
      <ClaimsBoard
        suppliers={suppliers}
        canCreate={can.createAnomaly(user.role)}
        prefill={an ? {
          date: an.createdAt.toISOString().slice(0, 10), supplier: an.supplierName, supplierId: an.supplierId ? String(an.supplierId) : "", reference: an.reference ?? "",
          product: an.productName ?? "", description: an.description, action: an.followUp ?? "", amount: an.creditAmount ?? "",
          receptionId: an.receptionId ? String(an.receptionId) : "", anomalyId: String(an.id),
        } : undefined}
        canManage={can.manageAnomalies(user.role)}
        rows={rows.map(({ c: x, supplier }) => ({
          id: x.id, date: fmtDate(x.date, locale), dateIso: x.date, supplier: supplier ?? x.supplierName ?? "", supplierId: x.supplierId,
          reference: x.reference ?? "", product: x.product ?? "", subject: x.subject, amount: num(x.amount), credit: num(x.credit), notes: x.notes ?? "",
          status: x.status as "en_cours" | "cloturee" | "annulee", anomalyId: x.anomalyId, weighGapId: x.weighGapId, receptionId: x.receptionId,
          source: x.source as "manual" | "anomaly" | "weigh", anomalyNumber: x.anomalyId ? numbers.get(x.anomalyId) ?? null : null,
        }))}
      />
    </>
  );
}
