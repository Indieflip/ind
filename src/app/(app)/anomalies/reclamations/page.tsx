import { desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, num } from "@/lib/format";
import { lineDocLabel } from "@/lib/documents";
import { daysSince, stageOf } from "@/lib/anomaly";
import { supplierProcesses } from "@/lib/server/followup";
import { syncWeighAnomalies } from "@/lib/server/weighAnomalies";
import { PageHeader } from "@/components/ui";
import { ClaimsView } from "./ClaimsView";

/** Anomalies > Réclamations : les anomalies réclamées au fournisseur ou à vérifier sur facture (même suivi que le tableau de bord) */
export default async function ClaimsPage() {
  await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  await syncWeighAnomalies();
  const a = schema.anomalies;
  const db = getDb();
  const [rows, processes] = await Promise.all([
    db
      .select({ a, supplier: schema.suppliers.name, documents: schema.receptions.documents, blNumber: schema.receptions.blNumber, lineDoc: schema.receptionLines.document })
      .from(a)
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, a.supplierId))
      .leftJoin(schema.receptions, eq(schema.receptions.id, a.receptionId))
      .leftJoin(schema.receptionLines, eq(schema.receptionLines.id, a.lineId))
      .where(isNull(a.consolidatedAt))
      .orderBy(desc(a.createdAt)),
    supplierProcesses(),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader title={t.claims.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{t.claims.introView}</p>
      <ClaimsView
        rows={rows.map(({ a: x, supplier, documents, blNumber, lineDoc }) => {
          const delay = processes.find(x.supplierId, x.supplierName)?.delay ?? 3;
          const days = daysSince(x.lastActionAt, x.createdAt, now);
          const stage = stageOf(x.stage);
          return {
            id: x.id, date: fmtDate(x.createdAt, locale), dateIso: x.createdAt.toISOString(), supplier: supplier ?? x.supplierName, supplierId: x.supplierId,
            reference: (x.receptionId ? lineDocLabel(documents, lineDoc, blNumber) : null) ?? x.reference ?? "", product: x.productName ?? "",
            subject: x.description, mode: x.mode, stage, resolution: x.resolution, claimed: num(x.claimedAmount), credit: num(x.creditAmount),
            days, due: (stage === "reclamee" || stage === "a_verifier") && x.mode !== "verification" && days >= delay, source: x.source,
          };
        })}
      />
    </>
  );
}
