import { isNotNull, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { categoryOptions, one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { AddFv, FvTable } from "./FvClient";
import { supplierMatcher } from "@/lib/server/maj";

export default async function FruitsLegumesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewFv);
  const { t, locale } = await getDict();
  const cats = await categoryOptions(locale);
  const sp = await searchParams;
  const db = getDb();
  const years = (await db.selectDistinct({ year: schema.fvItems.year }).from(schema.fvItems).orderBy(desc(schema.fvItems.year))).map((y) => y.year);
  const thisYear = new Date().getFullYear();
  const year = Number(one(sp.year)) || years[0] || thisYear;
  const matcher = await supplierMatcher();
  const units = (await db.select({ name: schema.units.name }).from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name))).map((u) => u.name);
  const all = await db.select().from(schema.fvItems).where(eq(schema.fvItems.year, year)).orderBy(asc(schema.fvItems.position), asc(schema.fvItems.id));
  const rows = all;
  // Compte produit (Mercurial) de chaque ligne de fruits et légumes
  const linked = await db.select({ id: schema.products.id, fv: schema.products.fvItemId }).from(schema.products).where(isNotNull(schema.products.fvItemId));
  const productOf = new Map(linked.map((x) => [x.fv!, x.id]));
  const suppliers = [...new Set(all.map((r) => r.supplier))].sort((a, b) => a.localeCompare(b, "fr"));
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long" }).format(new Date(2026, i, 15)));
  const currentMonth = year === thisYear ? new Date().getMonth() : -1;

  return (
    <>
      <PageHeader title={t.fv.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-stone-600">{t.fv.intro}</p>
      {can.editFv(user.role) && <AddFv categories={cats} year={year} suppliers={suppliers} units={units} />}
      <form method="get" className="no-print mb-3 flex items-end gap-2">
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.fv.year}</span>
          <select name="year" defaultValue={year} className="input py-2">
            {[...new Set([...years, thisYear])].sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button className="btn-secondary py-2">{t.common.apply}</button>
      </form>
      <p className="mb-2 text-xs text-stone-500">🔒 {t.fv.lockedHint} {t.fv.monthHint}</p>
      <FvTable rows={rows.map((r) => ({ id: r.id, supplierId: matcher.find(r.supplier), supplier: r.supplier, product: r.product, unit: r.unit, prices: r.prices, blocked: r.blocked, locked: r.locked, productId: productOf.get(r.id) ?? null }))} months={months} currentMonth={currentMonth} editable={can.editFv(user.role)} units={units} />
    </>
  );
}
