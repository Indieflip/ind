import Link from "next/link";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { dateRange, one, receptionNumbers, supplierOptions, type SP } from "@/lib/server/queries";
import { Empty, Field, FilterBar, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/DecisionBadge";
import { AnomalyForm, AnomalyManage } from "./AnomalyClient";

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const f = { from: one(sp.from), to: one(sp.to), supplier: one(sp.supplier), status: one(sp.status) ?? (sp.status === undefined ? "active" : undefined), type: one(sp.type) };
  const a = schema.anomalies;
  const conds: SQL[] = [...dateRange(a.createdAt, f.from, f.to)];
  if (f.supplier && /^\d+$/.test(f.supplier)) conds.push(eq(a.supplierId, Number(f.supplier)));
  if (f.status === "active") conds.push(inArray(a.status, ["open", "claimed", "credit_received"]));
  else if (f.status && (schema.anomalyStatusEnum.enumValues as readonly string[]).includes(f.status)) conds.push(eq(a.status, f.status as "open"));
  if (f.type && (schema.anomalyTypeEnum.enumValues as readonly string[]).includes(f.type)) conds.push(eq(a.type, f.type as "other"));

  const rows = await getDb()
    .select({ a, userName: schema.users.name })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.createdBy))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(a.createdAt))
    .limit(500);

  const suppliers = await supplierOptions();
  const numbers = await receptionNumbers();
  const recent = await getDb()
    .select({ id: schema.receptions.id, blNumber: schema.receptions.blNumber, supplierName: schema.receptions.supplierName, deliveredAt: schema.receptions.deliveredAt })
    .from(schema.receptions)
    .orderBy(desc(schema.receptions.deliveredAt))
    .limit(300);
  const preselect = Number(one(sp.reception)) || null;
  const receptionOptions = recent.map((r) => ({
    id: r.id,
    label: `${numbers.get(r.id) ?? ""}. ${r.blNumber ? `BL ${r.blNumber}` : "—"} · ${r.supplierName} · ${fmtDate(r.deliveredAt, locale)}`,
  }));
  const manage = can.manageAnomalies(user.role);

  return (
    <>
      <PageHeader title={t.anomalies.title} />
      {can.createAnomaly(user.role) && <AnomalyForm receptions={receptionOptions} preselect={preselect} />}
      <FilterBar applyLabel={t.common.filter} resetHref="/anomalies" resetLabel={t.common.reset}>
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
            <option value="active">{t.anomalies.statuses.open} / {t.anomalies.statuses.claimed} / {t.anomalies.statuses.credit_received}</option>
            <option value="">{t.common.all}</option>
            {Object.entries(t.anomalies.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label={t.anomalies.type}>
          <select name="type" defaultValue={f.type ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {Object.entries(t.anomalies.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </FilterBar>

      {rows.length === 0 ? (
        <Empty>{t.anomalies.empty}</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ a: x, userName }) => (
            <li key={x.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{x.supplierName}</span>
                    <span className="badge bg-stone-100 text-stone-700">{t.anomalies.types[x.type]}</span>
                    <StatusBadge status={x.status} label={t.anomalies.statuses[x.status]} />
                  </div>
                  <p className="mt-1 text-sm">{x.description}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {t.anomalies.created} {fmtDate(x.createdAt, locale)}{userName ? ` · ${userName}` : ""}
                    {x.receptionId && (
                      <> · <Link className="text-brand-700 underline" href={`/receptions/${x.receptionId}`}>{t.anomalies.reception}</Link></>
                    )}
                  </p>
                </div>
                {x.photoUrl && (
                  <a href={x.photoUrl} target="_blank">
                    {/\.pdf($|\?)/i.test(x.photoUrl) ? <span className="badge bg-stone-100 text-stone-700">PDF</span> : <img src={x.photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />}
                  </a>
                )}
              </div>
              {manage ? (
                <AnomalyManage id={x.id} status={x.status} creditAmount={x.creditAmount ?? ""} followUp={x.followUp ?? ""} />
              ) : (
                x.followUp && <p className="mt-2 rounded bg-stone-50 p-2 text-sm text-stone-700">{x.followUp}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
