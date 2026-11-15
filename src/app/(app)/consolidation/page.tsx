import Link from "next/link";
import { and, desc, asc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { dateRange, one, supplierOptions, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/DecisionBadge";
import { ConsolidateForm, ConsolidatedTable } from "./ConsolidateForm";

export default async function ConsolidationPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewConsolidation);
  const { t, locale } = await getDict();
  const c = t.consolidation;
  const sp = await searchParams;
  const f = { from: one(sp.from), to: one(sp.to), supplier: one(sp.supplier) };
  const r = schema.receptions;
  const conds: SQL[] = [...dateRange(r.deliveredAt, f.from, f.to)];
  if (f.supplier && /^\d+$/.test(f.supplier)) conds.push(eq(r.supplierId, Number(f.supplier)));
  const by = alias(schema.users, "by");
  const db = getDb();
  const [pending, done, suppliers] = await Promise.all([
    db
      .select({ id: r.id, deliveredAt: r.deliveredAt, supplierName: r.supplierName, blNumber: r.blNumber, status: r.status })
      .from(r)
      .where(and(isNull(r.consolidatedAt), ...conds))
      .orderBy(asc(r.deliveredAt)),
    db
      .select({
        id: r.id, deliveredAt: r.deliveredAt, supplierName: r.supplierName, blNumber: r.blNumber, status: r.status,
        consolidatedAt: r.consolidatedAt, byName: by.name,
        notes: sql<number>`(select count(*)::int from reception_notes n where n.reception_id = ${r.id})`,
      })
      .from(r)
      .leftJoin(by, eq(by.id, r.consolidatedBy))
      .where(and(isNotNull(r.consolidatedAt), ...conds))
      .orderBy(desc(r.consolidatedAt))
      .limit(200),
    supplierOptions(),
  ]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

  return (
    <>
      <PageHeader title={c.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-stone-600">{c.intro}</p>

      <form method="get" className="no-print card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label><span className="mb-1 block text-xs font-medium text-stone-600">{t.common.from}</span><input type="date" name="from" defaultValue={f.from} className="input py-2" /></label>
        <label><span className="mb-1 block text-xs font-medium text-stone-600">{t.common.to}</span><input type="date" name="to" defaultValue={f.to} className="input py-2" /></label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.common.supplier}</span>
          <select name="supplier" defaultValue={f.supplier ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button className="btn-primary py-2">{t.common.filter}</button>
        <Link href={`/consolidation?from=${today}&to=${today}`} className="btn-secondary py-2">{c.today}</Link>
        <Link href="/consolidation" className="btn-ghost py-2">{t.common.reset}</Link>
      </form>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">{c.toConsolidate} <span className="text-sm font-normal text-stone-500">({pending.length})</span></h2>
        {(
          <ConsolidateForm
            canConsolidate={can.consolidate(user.role)}
            rows={pending.map((p) => ({
              id: p.id,
              date: fmtDateTime(p.deliveredAt, locale),
              dateSort: p.deliveredAt.toISOString(),
              supplierName: p.supplierName,
              blNumber: p.blNumber,
              status: p.status,
              statusLabel: t.receptionStatus[p.status],
            }))}
          />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{c.consolidated}</h2>
        <ConsolidatedTable
          rows={done.map((d) => ({
            id: d.id, blNumber: d.blNumber, date: fmtDateTime(d.deliveredAt, locale), dateSort: d.deliveredAt.toISOString(),
            supplierName: d.supplierName, status: d.status, statusLabel: t.receptionStatus[d.status],
            consolidated: `${fmtDateTime(d.consolidatedAt, locale)}${d.byName ? ` ${c.by} ${d.byName}` : ""}`,
            consolidatedSort: d.consolidatedAt ? d.consolidatedAt.toISOString() : "", notes: d.notes,
          }))}
        />
      </section>
    </>
  );
}
