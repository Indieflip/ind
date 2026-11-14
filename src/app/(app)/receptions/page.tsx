import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { listReceptions, receptionFilters, supplierOptions, type SP } from "@/lib/server/queries";
import { Empty, Field, FilterBar, PageHeader, qs } from "@/components/ui";
import { StatusBadge } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { DraftBanner } from "@/components/reception/DraftBanner";

export default async function ReceptionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const f = receptionFilters(await searchParams);
  const [rows, suppliers] = await Promise.all([listReceptions(f), supplierOptions()]);

  return (
    <>
      <PageHeader title={t.receptions.title}>
        <a className="btn-secondary" href={`/api/export/receptions${qs({ ...f })}`}>
          <Icon name="download" className="h-4 w-4" /> {t.common.exportCsv}
        </a>
      </PageHeader>

      {can.receive(user.role) && <DraftBanner />}

      <FilterBar applyLabel={t.common.filter} resetHref="/receptions" resetLabel={t.common.reset}>
        <Field label={t.common.from}><input type="date" name="from" defaultValue={f.from} className="input py-2" /></Field>
        <Field label={t.common.to}><input type="date" name="to" defaultValue={f.to} className="input py-2" /></Field>
        <Field label={t.common.supplier}>
          <select name="supplier" defaultValue={f.supplier ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label={t.common.status}>
          <select name="status" defaultValue={f.status ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {Object.entries(t.receptionStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </FilterBar>

      {rows.length === 0 ? (
        <Empty>{t.receptions.empty}</Empty>
      ) : (
        <>
          {/* Mobile : cartes */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/receptions/${r.id}`} className="card flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.supplierName}</div>
                    <div className="text-xs text-stone-500">
                      {fmtDateTime(r.deliveredAt, locale)} · {r.lineCount} {t.receptions.products}
                    </div>
                  </div>
                  <StatusBadge status={r.status} label={t.receptionStatus[r.status]} />
                </Link>
              </li>
            ))}
          </ul>
          {/* Ordinateur : tableau */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.common.date}</th>
                  <th>{t.common.supplier}</th>
                  <th>{t.receptions.bl}</th>
                  <th className="text-right">{t.receptions.products}</th>
                  <th>{t.common.status}</th>
                  <th>{t.receptions.createdBy}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="whitespace-nowrap"><Link className="font-medium text-brand-700 hover:underline" href={`/receptions/${r.id}`}>{fmtDateTime(r.deliveredAt, locale)}</Link></td>
                    <td>{r.supplierName}</td>
                    <td>{r.blNumber ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.lineCount}</td>
                    <td><StatusBadge status={r.status} label={t.receptionStatus[r.status]} /></td>
                    <td className="text-stone-500">{r.createdByName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
