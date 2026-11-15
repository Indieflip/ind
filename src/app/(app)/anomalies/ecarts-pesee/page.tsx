import { asc, desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, num } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { WeighTable } from "./WeighTable";

export default async function WeighGapsPage() {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const w = schema.weighGaps;
  const rows = await getDb().select().from(w).orderBy(desc(w.date), asc(w.position), asc(w.id));
  return (
    <>
      <PageHeader title={t.weigh.heading} />
      <p className="mb-1 text-sm font-medium text-amber-800">{t.weigh.margin}</p>
      <p className="mb-3 text-xs text-stone-500">{t.weigh.auto}</p>
      <WeighTable
        canEdit={can.manageAnomalies(user.role)}
        rows={rows.map((r) => ({
          id: r.id,
          date: fmtDate(r.date, locale),
          dateSort: r.date,
          nature: r.nature ?? "",
          supplier: r.supplierRef ?? "",
          product: r.product,
          qtyInvoiced: num(r.qtyInvoiced),
          unitPrice: num(r.unitPrice),
          qtyWeighed: num(r.qtyWeighed),
          loss: num(r.acceptableLoss),
          gapQty: num(r.gapQty),
          gapAmount: num(r.gapAmount),
          detail: r.detail ?? "",
          claimDate: r.claimDate ?? "",
          receptionId: r.receptionId,
        }))}
      />
    </>
  );
}
