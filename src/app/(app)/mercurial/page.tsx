import { asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { matches } from "@/lib/search";
import { one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SearchSuggest } from "@/components/SearchSuggest";
import { sortRows } from "@/components/SortHeader";
import { AddRow, MercurialTable, UnitsPanel } from "./MercurialClient";

const COLS = ["supplier", "nature", "name", "unit", "priceMin", "price"] as const;

export default async function MercurialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewMercurial);
  const { t } = await getDict();
  const sp = await searchParams;
  const f = {
    q: (one(sp.q) ?? "").trim(),
    supplier: one(sp.supplier),
    nature: one(sp.nature),
    inactive: one(sp.inactive),
    sort: (COLS as readonly string[]).includes(one(sp.sort) ?? "") ? one(sp.sort) : undefined,
    dir: one(sp.dir) === "desc" ? "desc" : "asc",
  };
  const db = getDb();
  const p = schema.products;
  const s = schema.suppliers;
  const [all, units, supplierRows] = await Promise.all([
    db
      .select({ id: p.id, supplierId: p.supplierId, supplier: s.name, nature: p.nature, name: p.name, unit: p.unit, priceMin: p.priceMin, price: p.price, priceLocked: p.priceLocked, active: p.active })
      .from(p)
      .innerJoin(s, eq(s.id, p.supplierId))
      .where(isNull(p.fvItemId)) // les fruits et légumes ont leur propre onglet
      .orderBy(asc(s.name), asc(p.name)),
    db.select().from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
    db.select({ id: s.id, name: s.name }).from(s).where(eq(s.active, true)).orderBy(asc(s.name)),
  ]);

  // Filtres et recherche tolérante (accents, majuscules, ponctuation) faits ici
  let rows = all
    .map((r) => ({ ...r, priceMin: num(r.priceMin), price: num(r.price) }))
    .filter((r) => (f.inactive ? true : r.active))
    .filter((r) => !f.supplier || String(r.supplierId) === f.supplier)
    .filter((r) => !f.nature || (r.nature ?? "").split(/,\s*/).includes(f.nature))
    .filter((r) => !f.q || matches(`${r.name} ${r.supplier}`, f.q));
  if (f.sort) rows = sortRows(rows, (r) => r[f.sort as (typeof COLS)[number]], f.dir);

  const active = all.filter((r) => r.active);
  // Tous les fournisseurs actifs, même sans produit (ex. fournisseur tout juste créé)
  const suppliers = supplierRows;
  const split = (v: string | null) => (v ?? "").split(/,\s*/).filter(Boolean);
  const natures = [...new Set(active.flatMap((r) => split(r.nature)))].sort((a, b) => a.localeCompare(b, "fr"));
  const suggestions = [...new Set([...active.map((r) => r.name), ...suppliers.map((x) => x.name)])];
  const editable = can.editMercurial(user.role);
  const exportQs = new URLSearchParams(Object.entries({ q: f.q, supplier: f.supplier, nature: f.nature }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title={t.mercurial.title}>
        <a className="btn-secondary" href={`/api/export/mercurial?${exportQs}`}><Icon name="download" className="h-4 w-4" /> {t.common.exportCsv}</a>
      </PageHeader>
      <p className="-mt-3 mb-4 text-sm text-stone-600">{t.mercurial.intro}</p>

      {editable && (
        <div className="mb-4 grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
          <AddRow suppliers={suppliers} units={units.map((u) => u.name)} natures={natures} />
          <UnitsPanel units={units.map((u) => ({ id: u.id, name: u.name }))} />
        </div>
      )}

      <form method="get" className="no-print card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.common.search}</span>
          <SearchSuggest defaultValue={f.q} options={suggestions} placeholder={t.mercurial.searchPh} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.common.supplier}</span>
          <select name="supplier" defaultValue={f.supplier ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">{t.mercurial.nature}</span>
          <select name="nature" defaultValue={f.nature ?? ""} className="input py-2">
            <option value="">{t.common.all}</option>
            {natures.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={!!f.inactive} className="h-4 w-4 accent-brand-600" />
          {t.mercurial.showInactive}
        </label>
        {f.sort && <><input type="hidden" name="sort" value={f.sort} /><input type="hidden" name="dir" value={f.dir} /></>}
        <button className="btn-primary py-2">{t.common.filter}</button>
      </form>

      <p className="mb-2 text-sm text-stone-500">{rows.length} {t.mercurial.count}{editable && ` · ${t.mercurial.priceTraced}`}</p>
      <MercurialTable rows={rows} suppliers={suppliers} units={units.map((u) => u.name)} natures={natures} editable={editable} sort={f.sort} dir={f.dir} params={{ ...f, sort: undefined, dir: undefined }} />
      <p className="mt-2 text-xs text-stone-500">{t.mercurial.fvManaged}</p>
    </>
  );
}
