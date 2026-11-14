import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime, fmtMoney, fmtNum } from "@/lib/format";
import { candidateReceptions, consolidate, parseSelection, resolveIds } from "@/lib/server/consolidation";
import { supplierOptions, type SP } from "@/lib/server/queries";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { StatusBadge } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { PrintButton } from "../receptions/[id]/Actions";
import { SelectAll } from "./SelectAll";

export default async function ConsolidationPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(can.consolidate);
  const { t, locale } = await getDict();
  const c = t.consolidation;
  const sp = await searchParams;
  const sel = parseSelection(sp);
  const [candidates, suppliers, ids] = await Promise.all([candidateReceptions(sel), supplierOptions(), resolveIds(sel)]);
  const result = await consolidate(ids);
  const checked = new Set(ids);
  // Les bons cochés hors période (ex. « Consolider ce bon » depuis un bon d'un autre jour) restent visibles
  const extra = result.receptions.filter((r) => !candidates.some((x) => x.id === r.id));
  const list = [...candidates, ...extra];
  const exportQs = new URLSearchParams({ ids: ids.join(",") }).toString();

  return (
    <>
      <PageHeader title={c.title}>
        {ids.length > 0 && (
          <>
            <a className="btn-secondary" href={`/api/export/consolidation?${exportQs}`}><Icon name="download" className="h-4 w-4" /> {t.common.exportCsv}</a>
            <PrintButton label={t.common.print} />
          </>
        )}
      </PageHeader>
      <p className="no-print -mt-3 mb-4 text-sm text-stone-600">{c.intro}</p>

      <form method="get" className="no-print card mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label><span className="mb-1 block text-xs font-medium text-stone-600">{t.common.from}</span><input type="date" name="from" defaultValue={sel.from} className="input py-2" /></label>
          <label><span className="mb-1 block text-xs font-medium text-stone-600">{t.common.to}</span><input type="date" name="to" defaultValue={sel.to} className="input py-2" /></label>
          <label>
            <span className="mb-1 block text-xs font-medium text-stone-600">{t.common.supplier}</span>
            <select name="supplier" defaultValue={sel.supplier ?? ""} className="input py-2">
              <option value="">{t.common.all}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button className="btn-secondary py-2">{t.common.filter}</button>
          <Link href="/consolidation" className="btn-ghost py-2">{c.today}</Link>
        </div>

        <h2 className="mb-2 mt-4 text-sm font-semibold">{c.selection}</h2>
        {list.length === 0 ? (
          <p className="text-sm text-stone-500">{c.none}</p>
        ) : (
          <>
            <SelectAll allLabel={c.selectAll} noneLabel={c.selectNone} />
            <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200">
              {list.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-stone-50">
                    <input type="checkbox" name="id" value={r.id} defaultChecked={checked.has(r.id)} className="h-5 w-5 accent-brand-600" data-bl />
                    <span className="w-32 shrink-0 text-sm tabular-nums text-stone-600">{fmtDateTime(r.deliveredAt, locale)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.supplierName}</span>
                    <span className="hidden text-sm text-stone-500 sm:inline">{r.blNumber ?? "—"}</span>
                    <StatusBadge status={r.status} label={t.receptionStatus[r.status as keyof typeof t.receptionStatus]} />
                  </label>
                </li>
              ))}
            </ul>
            <button className="btn-primary mt-3" name="sel" value="1"><Icon name="layers" className="h-4 w-4" /> {c.run}</button>
          </>
        )}
      </form>

      {ids.length === 0 ? (
        list.length > 0 && <Empty>{c.noneSelected}</Empty>
      ) : (
        <div className="space-y-6">
          <h2 className="text-xl font-bold">
            {c.result} · {result.receptions.length} {c.receptions}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={c.grandTotal} value={fmtMoney(result.amount, locale)} />
            <Stat label={c.refused} value={fmtMoney(result.refusedAmount, locale)} />
            <Stat label={t.reporting.reserves} value={result.reserves} hint={`${result.lines} ${c.lines}`} />
            <Stat label={t.reporting.refusals} value={result.refusals} />
          </div>

          {result.suppliers.map((s) => (
            <section key={s.supplierName} className="card overflow-x-auto">
              <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
                <h3 className="font-semibold">{s.supplierName} <span className="text-sm font-normal text-stone-500">· {s.receptions} {c.receptions}</span></h3>
                <span className="font-semibold tabular-nums">{fmtMoney(s.amount, locale)}</span>
              </div>
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>{t.common.product}</th>
                    <th>{t.common.unit}</th>
                    <th className="text-right">{c.qtyOrdered}</th>
                    <th className="text-right">{c.qtyReceived}</th>
                    <th className="text-right">{c.qtyRefused}</th>
                    <th className="text-right">{c.avgPrice}</th>
                    <th className="text-right">{c.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.products.map((p) => (
                    <tr key={p.productName + p.unit}>
                      <td className="font-medium">
                        {p.productName}
                        {p.bls > 1 && <span className="ml-1 text-xs text-stone-400">×{p.bls}</span>}
                        {(p.reserves > 0 || p.refusals > 0) && (
                          <span className="ml-2 badge bg-amber-100 text-amber-900">{p.reserves > 0 ? `${p.reserves} ${t.decision.reserve.toLowerCase()}` : ""}{p.reserves > 0 && p.refusals > 0 ? " · " : ""}{p.refusals > 0 ? `${p.refusals} ${t.decision.refuse.toLowerCase()}` : ""}</span>
                        )}
                      </td>
                      <td>{p.unit}</td>
                      <td className="text-right tabular-nums">{fmtNum(p.qtyOrdered, locale)}</td>
                      <td className="text-right tabular-nums">{fmtNum(p.qtyReceived, locale)}</td>
                      <td className="text-right tabular-nums">{p.qtyRefused ? fmtNum(p.qtyRefused, locale) : "—"}</td>
                      <td className="text-right tabular-nums">{fmtMoney(p.avgPrice, locale)}</td>
                      <td className="text-right font-medium tabular-nums">{fmtMoney(p.amount, locale)}</td>
                    </tr>
                  ))}
                  <tr className="bg-stone-50">
                    <td colSpan={6} className="font-semibold">{c.subtotal}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtMoney(s.amount, locale)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          ))}

          <section className="card overflow-x-auto">
            <h3 className="px-4 pt-4 font-semibold">{c.included}</h3>
            <table className="table mt-2">
              <thead>
                <tr><th>{t.common.date}</th><th>{t.common.supplier}</th><th>{t.receptions.bl}</th><th>{t.common.status}</th><th className="text-right">{c.amount}</th></tr>
              </thead>
              <tbody>
                {result.receptions.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/receptions/${r.id}`} className="text-brand-700 hover:underline">{fmtDateTime(r.deliveredAt, locale)}</Link></td>
                    <td>{r.supplierName}</td>
                    <td>{r.blNumber ?? "—"}</td>
                    <td><StatusBadge status={r.status} label={t.receptionStatus[r.status as keyof typeof t.receptionStatus]} /></td>
                    <td className="text-right tabular-nums">{fmtMoney(r.amount, locale)}</td>
                  </tr>
                ))}
                <tr className="bg-stone-50">
                  <td colSpan={4} className="font-semibold">{c.grandTotal}</td>
                  <td className="text-right font-semibold tabular-nums">{fmtMoney(result.amount, locale)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {result.receptions.some((r) => r.reservesText) && (
            <section className="card p-4">
              <h3 className="mb-2 font-semibold">{c.reservesList}</h3>
              <ul className="space-y-2 text-sm">
                {result.receptions.filter((r) => r.reservesText).map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{r.supplierName} · {r.blNumber ?? fmtDateTime(r.deliveredAt, locale)}</span>
                    <pre className="whitespace-pre-wrap font-sans text-stone-700">{r.reservesText}</pre>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
