import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { matches } from "@/lib/search";
import { one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { SearchSuggest } from "@/components/SearchSuggest";
import { AddFv, FvTable } from "./FvClient";

export default async function FruitsLegumesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewFv);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const db = getDb();
  const years = (await db.selectDistinct({ year: schema.fvItems.year }).from(schema.fvItems).orderBy(desc(schema.fvItems.year))).map((y) => y.year);
  const thisYear = new Date().getFullYear();
  const year = Number(one(sp.year)) || years[0] || thisYear;
  const q = (one(sp.q) ?? "").trim();
  const supplier = one(sp.supplier);
  const all = await db.select().from(schema.fvItems).where(eq(schema.fvItems.year, year)).orderBy(asc(schema.fvItems.position), asc(schema.fvItems.id));
  const rows = all.filter((r) => (!supplier || r.supplier === supplier) && (!q || matches(`${r.product} ${r.supplier}`, q)));
  const suppliers = [...new Set(all.map((r) => r.supplier))].sort((a, b) => a.localeCompare(b, "fr"));
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long" }).format(new Date(2026, i, 15)));
  const currentMonth = year === thisYear ? new Date().getMonth() : -1;

  return (
    <>
      <PageHeader title={t.fv.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-stone-600">{t.fv.intro}</p>
      {can.editFv(user.role) && <AddFv year={year} suppliers={suppliers} />}
      <form method="get" className="no-print card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.common.search}</span>
          <SearchSuggest defaultValue={q} options={[...new Set(all.map((r) => r.product))]} placeholder={t.mercurial.searchPh} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.fv.supplier}</span>
          <select name="supplier" defaultValue={supplier ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.fv.year}</span>
          <select name="year" defaultValue={year} className="input py-2">
            {[...new Set([...years, thisYear])].sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button className="btn-primary py-2">{t.common.filter}</button>
      </form>
      <p className="mb-2 flex flex-wrap items-center gap-3 text-sm text-stone-500">
        <span>{rows.length} {t.mercurial.count}</span>
        <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-900">🔒 {t.fv.locked} : {rows.filter((r) => r.locked).length} — {t.fv.lockedHint}</span>
      </p>
      <FvTable rows={rows.map((r) => ({ id: r.id, supplier: r.supplier, product: r.product, unit: r.unit, prices: r.prices, blocked: r.blocked, locked: r.locked }))} months={months} currentMonth={currentMonth} editable={can.editFv(user.role)} />
    </>
  );
}
