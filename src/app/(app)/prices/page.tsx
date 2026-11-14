import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, fmtPct, num } from "@/lib/format";
import { listPriceChanges, priceFilters } from "@/lib/server/prices";
import { supplierOptions, type SP } from "@/lib/server/queries";
import { Empty, Field, FilterBar, PageHeader, qs } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ClaimCell, AddPriceLine } from "./PriceClient";

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

      <FilterBar applyLabel={t.common.filter} resetHref="/prices" resetLabel={t.common.reset}>
        <Field label={t.common.from}><input type="date" name="from" defaultValue={f.from} className="input py-2" /></Field>
        <Field label={t.common.to}><input type="date" name="to" defaultValue={f.to} className="input py-2" /></Field>
        <Field label={t.common.supplier}>
          <select name="supplier" defaultValue={f.supplier ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label={t.prices.type}>
          <select name="type" defaultValue={f.type ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {Object.entries(t.prices.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium">
          <input type="checkbox" name="unclaimed" value="1" defaultChecked={!!f.unclaimed} className="h-4 w-4 accent-brand-600" />
          {t.prices.unclaimed}
        </label>
      </FilterBar>

      {rows.length === 0 ? (
        <Empty>{t.prices.empty}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t.common.date}</th>
                <th>{t.common.supplier}</th>
                <th>{t.common.product}</th>
                <th className="text-right">{t.prices.old}</th>
                <th className="text-right">{t.prices.new}</th>
                <th className="text-right">{t.prices.gap}</th>
                <th>{t.prices.source}</th>
                <th className="min-w-64">{t.prices.claim}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDate(r.date, locale)}</td>
                  <td>{r.supplierName}</td>
                  <td>
                    {r.productName}
                    <span className="text-xs text-stone-400"> / {r.unit}</span>
                  </td>
                  <td className="text-right tabular-nums text-stone-500">{fmtMoney(r.oldPrice, locale)}</td>
                  <td className="text-right font-medium tabular-nums">{fmtMoney(r.newPrice, locale)}</td>
                  <td className="text-right">
                    {r.type === "new_product" ? (
                      <span className="badge bg-sky-100 text-sky-800">{t.prices.types.new_product}</span>
                    ) : (
                      <span className={`font-semibold tabular-nums ${r.type === "increase" ? "text-red-600" : "text-emerald-600"}`}>{fmtPct(r.pct)}</span>
                    )}
                  </td>
                  <td className="text-xs text-stone-500">
                    {t.prices.sources[r.source]}
                    {r.invoiceRef && <div>{r.invoiceRef}</div>}
                  </td>
                  <td>{editable ? <ClaimCell id={r.id} initial={r.claim ?? ""} placeholder={t.prices.claimPlaceholder} /> : <span className="text-sm">{r.claim ?? "—"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
