import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, fmtPct, num, sentence } from "@/lib/format";
import { listPriceChanges, priceFilters, priceRecap } from "@/lib/server/prices";
import { supplierOptions, type SP } from "@/lib/server/queries";
import Link from "next/link";
import { Field, PageHeader, qs } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AddPriceLine, PricesTable } from "./PriceClient";

export default async function PricesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewPrices);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const f = priceFilters(sp);
  // Même période par défaut que le Reporting (3 derniers mois), pour que les chiffres correspondent
  if (!("from" in sp) && !("to" in sp)) {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    f.from = d.toISOString().slice(0, 10);
    f.to = new Date().toISOString().slice(0, 10);
  }
  const editable = can.editPrices(user.role);
  const [rows, recap, suppliers, products] = await Promise.all([
    listPriceChanges(f),
    priceRecap(f),
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

      <PriceRecap recap={recap} f={f} t={t} />

      {editable && <AddPriceLine suppliers={suppliers} products={products.map((p) => ({ ...p, price: num(p.price) }))} />}

      <form method="get" className="no-print card mb-3 flex flex-wrap items-end gap-3 p-3">
        <Field label={t.common.from}><input type="date" name="from" defaultValue={f.from} className="input py-2" /></Field>
        <Field label={t.common.to}><input type="date" name="to" defaultValue={f.to} className="input py-2" /></Field>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium">
          <input type="checkbox" name="unclaimed" value="1" defaultChecked={!!f.unclaimed} className="h-4 w-4 accent-brand-600" />
          {t.prices.unclaimed}
        </label>
        {f.supplier && <input type="hidden" name="supplier" value={f.supplier} />}
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

type Dict = Awaited<ReturnType<typeof getDict>>["t"];
const pct1 = (v: number | null) => (v == null ? "—" : fmtPct(Math.round(v * 10) / 10));

/** Récapitulatif qui justifie les chiffres du Reporting (hausses, moyenne, sans réclamation, baisses) */
function PriceRecap({ recap, f, t }: { recap: Awaited<ReturnType<typeof priceRecap>>; f: ReturnType<typeof priceFilters>; t: Dict }) {
  const r = t.prices.recap;
  const tot = recap.reduce(
    (a, x) => ({ inc: a.inc + x.increases, unc: a.unc + x.unclaimed, dec: a.dec + x.decreases, incSum: a.incSum + (x.avgIncrease ?? 0) * x.increases, decSum: a.decSum + (x.avgDecrease ?? 0) * x.decreases }),
    { inc: 0, unc: 0, dec: 0, incSum: 0, decSum: 0 },
  );
  const base = { from: f.from, to: f.to };
  const cell = "px-3 py-2 text-right tabular-nums";
  return (
    <section className="card mb-4 overflow-x-auto">
      <div className="px-4 pt-4">
        <h2 className="font-semibold">{r.title}</h2>
        <p className="mt-0.5 text-xs text-stone-500">{r.hint}</p>
      </div>
      <table className="mt-2 w-full min-w-[640px] text-sm">
        <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-3 py-2 text-left">{r.supplier}</th>
            <th className="px-3 py-2 text-right">{r.increases}</th>
            <th className="px-3 py-2 text-right">{r.avgIncrease}</th>
            <th className="px-3 py-2 text-right">{r.maxIncrease}</th>
            <th className="px-3 py-2 text-right">{r.unclaimed}</th>
            <th className="px-3 py-2 text-right">{r.decreases}</th>
            <th className="px-3 py-2 text-right">{r.avgDecrease}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {recap.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-stone-500">{t.prices.empty}</td></tr>}
          {recap.map((x) => (
            <tr key={x.supplier} className={f.supplier && String(x.supplierId) === f.supplier ? "bg-brand-50" : undefined}>
              <td className="px-3 py-2 font-medium">{sentence(x.supplier)}</td>
              <td className={cell}>{x.increases ? <Link className="text-brand-700 underline" href={`/reporting/prix${qs({ ...base, supplier: x.supplierId ? String(x.supplierId) : undefined, type: "increase" })}`}>{x.increases}</Link> : 0}</td>
              <td className={cell}>{pct1(x.avgIncrease)}</td>
              <td className={cell}>{pct1(x.maxIncrease)}</td>
              <td className={`${cell} ${x.unclaimed ? "text-amber-700" : ""}`}>{x.unclaimed ? <Link className="underline" href={`/reporting/prix${qs({ ...base, supplier: x.supplierId ? String(x.supplierId) : undefined, unclaimed: "1" })}`}>{x.unclaimed}</Link> : 0}</td>
              <td className={cell}>{x.decreases ? <Link className="text-brand-700 underline" href={`/reporting/prix${qs({ ...base, supplier: x.supplierId ? String(x.supplierId) : undefined, type: "decrease" })}`}>{x.decreases}</Link> : 0}</td>
              <td className={cell}>{pct1(x.avgDecrease)}</td>
              <td className="px-3 py-2 text-right">{x.supplierId && <Link className="btn-ghost px-2 py-1 text-xs" href={`/reporting/prix${qs({ ...base, supplier: String(x.supplierId) })}`}>{r.detail}</Link>}</td>
            </tr>
          ))}
        </tbody>
        {recap.length > 0 && (
          <tfoot className="border-t-2 border-stone-200 font-semibold">
            <tr>
              <td className="px-3 py-2">{r.total}</td>
              <td className={cell}>{tot.inc}</td>
              <td className={cell}>{pct1(tot.inc ? tot.incSum / tot.inc : null)}</td>
              <td className={cell} />
              <td className={cell}>{tot.unc}</td>
              <td className={cell}>{tot.dec}</td>
              <td className={cell}>{pct1(tot.dec ? tot.decSum / tot.dec : null)}</td>
              <td className="px-3 py-2 text-right">{(f.supplier || f.type || f.unclaimed) && <Link className="btn-ghost px-2 py-1 text-xs" href={`/reporting/prix${qs(base)}`}>{r.all}</Link>}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
