import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, num } from "@/lib/format";
import { linkWeighGaps } from "@/lib/server/maj";
import { PageHeader } from "@/components/ui";
import { WeighTable } from "./WeighTable";

export default async function WeighGapsPage() {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  await linkWeighGaps();
  const w = schema.weighGaps;
  const db = getDb();
  const [rows, suppliers] = await Promise.all([
    db
      .select({ g: w, supplier: schema.suppliers.name, productName: schema.products.name })
      .from(w)
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, w.supplierId))
      .leftJoin(schema.products, eq(schema.products.id, w.productId))
      .orderBy(desc(w.date), asc(w.position), asc(w.id)),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name)),
  ]);
  return (
    <>
      <PageHeader title={t.weigh.heading} />
      <p className="mb-1 text-sm font-medium text-amber-800">{t.weigh.margin}</p>
      <p className="mb-3 text-xs text-stone-500">{t.weigh.auto}</p>
      <WeighTable
        canEdit={can.manageAnomalies(user.role)}
        suppliers={suppliers}
        rows={rows.map(({ g: r, supplier, productName }) => ({
          id: r.id,
          date: fmtDate(r.date, locale),
          dateIso: r.date,
          nature: r.nature ?? "",
          supplier: supplier ?? (r.supplierRef ?? "").split(/\s+:\s+/)[0],
          supplierId: r.supplierId,
          reference: r.reference ?? "",
          product: productName ?? r.product,
          original: productName && productName !== r.product ? r.product : null,
          rawProduct: r.product,
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
