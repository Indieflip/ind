import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, num } from "@/lib/format";
import { lineDocLabel } from "@/lib/documents";
import { daysSince, stageOf, isClaimMode } from "@/lib/anomaly";
import { supplierProcesses } from "@/lib/server/followup";
import { syncWeighAnomalies } from "@/lib/server/weighAnomalies";
import { ensureClaimNumbers } from "@/lib/server/claimNumbers";
import { PageHeader } from "@/components/ui";
import { one, type SP } from "@/lib/server/queries";
import { ClaimsView } from "./ClaimsView";

/** Anomalies > Réclamations : les anomalies réclamées au fournisseur ou à vérifier sur facture (même suivi que le tableau de bord) */
export default async function ClaimsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const sp = await searchParams;
  const f = one(sp.f);
  // Lien depuis une fiche d'anomalie : « Réclamation N° 258 » → les fiches de cette réclamation
  const claimNo = Number(one(sp.n)) || null;
  const { t, locale } = await getDict();
  await syncWeighAnomalies();
  await ensureClaimNumbers();
  const a = schema.anomalies;
  const db = getDb();
  const [rows, processes] = await Promise.all([
    db
      .select({ a, supplier: schema.suppliers.name, documents: schema.receptions.documents, blNumber: schema.receptions.blNumber, lineDoc: schema.receptionLines.document })
      .from(a)
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, a.supplierId))
      .leftJoin(schema.receptions, eq(schema.receptions.id, a.receptionId))
      .leftJoin(schema.receptionLines, eq(schema.receptionLines.id, a.lineId))
      .orderBy(desc(a.createdAt)),
    supplierProcesses(),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader title={t.claims.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{t.claims.introView}</p>
      <ClaimsView
        canManage={can.manageAnomalies(user.role)}
        initialFilter={f === "sans-montant" ? "missing" : undefined}
        claimNo={claimNo}
        rows={rows.map(({ a: x, supplier, documents, blNumber, lineDoc }) => {
          const delay = processes.find(x.supplierId, x.supplierName)?.delay ?? 3;
          const days = daysSince(x.lastActionAt, x.createdAt, now);
          const stage = stageOf(x.stage);
          return {
            id: x.id, claimNo: x.claimNo ?? 0, consolidated: !!x.consolidatedAt, date: fmtDate(x.createdAt, locale), dateIso: x.createdAt.toISOString(), supplier: supplier ?? x.supplierName, supplierId: x.supplierId,
            reference: (x.receptionId ? lineDocLabel(documents, lineDoc, blNumber) : null) ?? x.reference ?? "", product: x.productName ?? "",
            subject: x.description, mode: x.mode, stage, resolution: x.resolution, claimed: num(x.claimedAmount), credit: num(x.creditAmount),
            days, due: (stage === "reclamee" || stage === "a_verifier") && isClaimMode(x.mode) && days >= delay, source: x.source,
          };
        })}
      />
    </>
  );
}
