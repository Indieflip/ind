import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, fmtPct, num } from "@/lib/format";
import { listPriceChanges, priceFilters } from "@/lib/server/prices";
import { supplierOptions, type SP } from "@/lib/server/queries";
import { Field, PageHeader, qs } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AddPriceLine, PricesTable } from "./PriceClient";

export default async function PricesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewPrices);
  const { t, locale } = await getDict();
  const f = priceFilters(await searchParams);
  const editable = can.editPrices(user.role);
  const [rows, suppliers, products] = await Promise.all([
    listPriceChanges(f),
    supplierOptions(),
    editable
      ? getDb().select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId, price: schema.products.price, unit: schema.products.unit })
          .from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.name))
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title={t.prices.title}>
        <a className="btn-secondary" href={`/api/export/prices${qs({ ...f })}`}><Icon name="download" className="h-4 w-4" /> {t.common.exportCsv}</a>
      </PageHeader>

      {editable && <AddPriceLine suppliers={suppliers} products={products.map((p) => ({ ...p, price: num(p.price) }))} />}

      <form method="get" className="no-print card mb-3 flex flex-wrap items-end gap-3 p-3">
        <Field label={t.common.from}><input type="date" name="from" defaultValue={f.from} className="input py-2" /></Field>
        <Field label={t.common.to}><input type="date" name="to" defaultValue={f.to} className="input py-2" /></Field>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium">
          <input type="checkbox" name="unclaimed" value="1" defaultChecked={!!f.unclaimed} className="h-4 w-4 accent-brand-600" />
          {t.prices.unclaimed}
        </label>
        <button className="btn-secondary py-2">{t.common.apply}</button>
      </form>

      <PricesTable
        editable={editable}
        rows={rows.map((r) => ({
          id: r.id,
          date: fmtDate(r.date, locale),
          dateSort: r.date.toISOString(),
          supplier: r.supplierName,
          product: r.productName,
          unit: r.unit ?? "",
          old: fmtMoney(r.oldPrice, locale),
          oldN: num(r.oldPrice),
          new: fmtMoney(r.newPrice, locale),
          newN: num(r.newPrice),
          type: r.type,
          typeLabel: t.prices.types[r.type],
          pct: r.pct,
          pctLabel: r.type === "new_product" ? t.prices.types.new_product : fmtPct(r.pct),
          source: `${t.prices.sources[r.source]}${r.invoiceRef ? ` · ${r.invoiceRef}` : ""}`,
          claim: r.claim ?? "",
        }))}
      />
    </>
  );
}
