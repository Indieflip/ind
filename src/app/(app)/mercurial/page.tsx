import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { one, supplierOptions, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AddRow, MercurialTable, UnitsPanel } from "./MercurialClient";

export default async function MercurialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewMercurial);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim();
  const supplier = one(sp.supplier);
  const inactive = one(sp.inactive) === "1";
  const db = getDb();
  const p = schema.products;
  const s = schema.suppliers;
  const conds: SQL[] = [];
  if (!inactive) conds.push(eq(p.active, true));
  if (supplier && /^\d+$/.test(supplier)) conds.push(eq(p.supplierId, Number(supplier)));
  if (q) conds.push(sql`(${p.name} ilike ${"%" + q + "%"} or ${s.name} ilike ${"%" + q + "%"})`);

  const [rows, suppliers, units, cats] = await Promise.all([
    db
      .select({ id: p.id, supplierId: p.supplierId, supplierName: s.name, name: p.name, unit: p.unit, price: p.price, categoryId: p.categoryId, active: p.active })
      .from(p)
      .innerJoin(s, eq(s.id, p.supplierId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(s.name), asc(p.name)),
    supplierOptions(),
    db.select().from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
  ]);
  const editable = can.editMercurial(user.role);
  const categories = cats.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr }));
  const exportQs = new URLSearchParams({ ...(q ? { q } : {}), ...(supplier ? { supplier } : {}) }).toString();

  return (
    <>
      <PageHeader title={t.mercurial.title}>
        <a className="btn-secondary" href={`/api/export/mercurial?${exportQs}`}><Icon name="download" className="h-4 w-4" /> {t.common.exportCsv}</a>
      </PageHeader>
      <p className="-mt-3 mb-4 text-sm text-stone-600">{t.mercurial.intro}</p>

      {editable && (
        <div className="mb-4 grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
          <AddRow suppliers={suppliers} units={units.map((u) => u.name)} categories={categories} />
          <UnitsPanel units={units.map((u) => ({ id: u.id, name: u.name }))} />
        </div>
      )}

      <form method="get" className="no-print card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.common.search}</span>
          <input name="q" defaultValue={q} className="input py-2" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.common.supplier}</span>
          <select name="supplier" defaultValue={supplier ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={inactive} className="h-4 w-4 accent-brand-600" />
          {t.mercurial.showInactive}
        </label>
        <button className="btn-primary py-2">{t.common.filter}</button>
      </form>

      <p className="mb-2 text-sm text-stone-500">{rows.length} {t.mercurial.count}{editable && ` · ${t.mercurial.priceTraced}`}</p>
      <MercurialTable
        rows={rows.map((r) => ({ ...r, price: num(r.price) }))}
        suppliers={suppliers}
        units={units.map((u) => u.name)}
        categories={categories}
        editable={editable}
      />
    </>
  );
}
