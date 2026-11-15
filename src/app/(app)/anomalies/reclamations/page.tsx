import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, num } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ClaimsBoard } from "./ClaimsClient";

/** Anomalies > Réclamations : réclamations auprès des fournisseurs (En cours, Clôturée, Annulée) */
export default async function ClaimsPage() {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const c = schema.claims;
  const db = getDb();
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
        canManage={can.manageAnomalies(user.role)}
        rows={rows.map(({ c: x, supplier }) => ({
          id: x.id, date: fmtDate(x.date, locale), dateIso: x.date, supplier: supplier ?? x.supplierName ?? "", supplierId: x.supplierId,
          reference: x.reference ?? "", product: x.product ?? "", subject: x.subject, amount: num(x.amount), credit: num(x.credit), notes: x.notes ?? "",
          status: x.status as "en_cours" | "cloturee" | "annulee", anomalyId: x.anomalyId, weighGapId: x.weighGapId, receptionId: x.receptionId,
        }))}
      />
    </>
  );
}
