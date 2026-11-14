import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { listReceptions, one, receptionFilters, supplierOptions, type SP } from "@/lib/server/queries";
import { SortHeader, sortRows } from "@/components/SortHeader";
import { Empty, Field, FilterBar, PageHeader, qs } from "@/components/ui";
import { StatusBadge } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { DraftBanner, DeleteDraftButton } from "@/components/reception/DraftBanner";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export default async function ReceptionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const f = receptionFilters(sp);
  const sort = ["number", "bl", "date", "supplier", "lines", "status", "state", "author"].includes(one(sp.sort) ?? "") ? one(sp.sort)! : "date";
  // Par défaut : les plus récents d'abord
  const dir = one(sp.dir) === "asc" || one(sp.dir) === "desc" ? one(sp.dir)! : one(sp.sort) ? "asc" : "desc";
  const [raw, suppliers, drafts] = await Promise.all([
    listReceptions(f),
    supplierOptions(),
    getDb()
      .select({ id: schema.receptionDrafts.id, supplierName: schema.receptionDrafts.supplierName, blNumber: schema.receptionDrafts.blNumber, updatedAt: schema.receptionDrafts.updatedAt, by: schema.users.name })
      .from(schema.receptionDrafts)
      .leftJoin(schema.users, eq(schema.users.id, schema.receptionDrafts.createdBy))
      .orderBy(desc(schema.receptionDrafts.updatedAt)),
  ]);
  const key: Record<string, (r: (typeof raw)[number]) => unknown> = {
    number: (r) => r.number, bl: (r) => r.blNumber, date: (r) => r.deliveredAt, supplier: (r) => r.supplierName,
    lines: (r) => r.lineCount, status: (r) => t.receptionStatus[r.status], state: (r) => (r.consolidatedAt ? 1 : 0), author: (r) => r.createdByName,
  };
  const rows = sortRows(raw, key[sort], dir);
  const params = { ...f } as Record<string, string | undefined>;
  const th = (label: string, col: string, align?: "right") => (
    <SortHeader label={label} col={col} sort={sort} dir={dir} params={params} basePath="/receptions" align={align} titles={{ asc: t.receptions.sortAsc, desc: t.receptions.sortDesc }} />
  );

  return (
    <>
      <PageHeader title={t.receptions.title}>
        <a className="btn-secondary" href={`/api/export/receptions${qs({ ...f })}`}>
          <Icon name="download" className="h-4 w-4" /> {t.common.exportCsv}
        </a>
      </PageHeader>

      {can.receive(user.role) && <DraftBanner />}
      {one(sp.draft) === "saved" && <p className="no-print mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{t.receptions.draftSaved}</p>}
      {drafts.length > 0 && can.receive(user.role) && (
        <section className="no-print card mb-4 border-l-4 border-l-amber-400">
          <h2 className="px-4 pt-3 text-sm font-semibold">{t.receptions.drafts} ({drafts.length})</h2>
          <ul className="divide-y divide-stone-100">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <strong>{d.supplierName || "—"}</strong>
                  {d.blNumber && <span className="text-stone-500"> · BL {d.blNumber}</span>}
                  <span className="text-xs text-stone-500"> · {fmtDateTime(d.updatedAt, locale)}{d.by ? ` ${t.receptions.draftBy} ${d.by}` : ""}</span>
                </span>
                <Link href={`/receptions/new?draft=${d.id}`} className="btn-primary px-3 py-1.5">{t.receptions.resumeDraft}</Link>
                {can.deleteDraftReception(user.role) && <DeleteDraftButton id={d.id} confirmText={t.receptions.deleteDraftConfirm} label={t.common.delete} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <FilterBar applyLabel={t.common.filter} resetHref="/receptions" resetLabel={t.common.reset}>
        <Field label={t.receptions.searchBl}><input name="bl" defaultValue={f.bl} className="input w-36 py-2" placeholder="BL…" /></Field>
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
        <Field label={t.nav.consolidation}>
          <select name="state" defaultValue={f.state ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            <option value="pending">{t.receptions.toConsolidate}</option>
            <option value="consolidated">{t.receptions.consolidated}</option>
          </select>
        </Field>
        {one(sp.sort) && <><input type="hidden" name="sort" value={sort} /><input type="hidden" name="dir" value={dir} /></>}
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
                    <div className="truncate font-semibold">
                      <span className="mr-1.5 text-xs font-normal text-stone-400">{r.number}.</span>{r.supplierName}
                    </div>
                    <div className="text-xs text-stone-500">
                      {r.blNumber ? <span className="font-medium text-brand-700">{r.blNumber}</span> : "—"} · {fmtDateTime(r.deliveredAt, locale)} · {r.lineCount} {t.receptions.products}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={r.status} label={t.receptionStatus[r.status]} />
                    {r.consolidatedAt && <span className="badge bg-stone-100 text-stone-600"><Icon name="check" className="mr-0.5 h-3 w-3" />{t.receptions.consolidated}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {/* Ordinateur : tableau */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  {th(t.receptions.number, "number", "right")}
                  {th(t.receptions.bl, "bl")}
                  {th(t.common.date, "date")}
                  {th(t.common.supplier, "supplier")}
                  {th(t.receptions.products, "lines", "right")}
                  {th(t.common.status, "status")}
                  {th(t.nav.consolidation, "state")}
                  {th(t.receptions.createdBy, "author")}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="text-right tabular-nums text-stone-500">{r.number}</td>
                    <td className="whitespace-nowrap">
                      <Link className="font-semibold text-brand-700 hover:underline" href={`/receptions/${r.id}`}>{r.blNumber || "—"}</Link>
                    </td>
                    <td className="whitespace-nowrap"><Link className="hover:underline" href={`/receptions/${r.id}`}>{fmtDateTime(r.deliveredAt, locale)}</Link></td>
                    <td>{r.supplierName}</td>
                    <td className="text-right tabular-nums">{r.lineCount}</td>
                    <td><StatusBadge status={r.status} label={t.receptionStatus[r.status]} /></td>
                    <td>{r.consolidatedAt ? <span className="badge bg-emerald-50 text-emerald-800"><Icon name="check" className="mr-0.5 h-3 w-3" />{t.receptions.consolidated}</span> : <span className="text-xs text-stone-500">{t.receptions.toConsolidate}</span>}</td>
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
