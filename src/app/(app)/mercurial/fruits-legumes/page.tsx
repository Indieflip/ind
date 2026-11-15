import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { AddFv, FvTable } from "./FvClient";

export default async function FruitsLegumesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewFv);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const db = getDb();
  const years = (await db.selectDistinct({ year: schema.fvItems.year }).from(schema.fvItems).orderBy(desc(schema.fvItems.year))).map((y) => y.year);
  const thisYear = new Date().getFullYear();
  const year = Number(one(sp.year)) || years[0] || thisYear;
  const all = await db.select().from(schema.fvItems).where(eq(schema.fvItems.year, year)).orderBy(asc(schema.fvItems.position), asc(schema.fvItems.id));
  const rows = all;
  const suppliers = [...new Set(all.map((r) => r.supplier))].sort((a, b) => a.localeCompare(b, "fr"));
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long" }).format(new Date(2026, i, 15)));
  const currentMonth = year === thisYear ? new Date().getMonth() : -1;

  return (
    <>
      <PageHeader title={t.fv.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-stone-600">{t.fv.intro}</p>
      {can.editFv(user.role) && <AddFv year={year} suppliers={suppliers} />}
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
      <FvTable rows={rows.map((r) => ({ id: r.id, supplier: r.supplier, product: r.product, unit: r.unit, prices: r.prices, blocked: r.blocked, locked: r.locked }))} months={months} currentMonth={currentMonth} editable={can.editFv(user.role)} />
    </>
  );
}
