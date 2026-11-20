import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { fvRange, parisMonth } from "@/lib/pricing";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AddRow, MercurialTable, UnitsPanel } from "./MercurialClient";
import { productUpdatedAt } from "@/lib/server/productUpdates";
import { ensureMajCleanup, ensureMajNormalized } from "@/lib/server/maj";

export default async function MercurialPage() {
  const user = await requireUser(can.viewMercurial);
  // Historique du Mercurial : nettoyage et rattachement aux produits (une fois)
  await ensureMajNormalized();
  await ensureMajCleanup();
  const { t } = await getDict();
  const db = getDb();
  const p = schema.products;
  const s = schema.suppliers;
  const [all, units, supplierRows, fvItems] = await Promise.all([
    db
      .select({ id: p.id, supplierId: p.supplierId, supplier: s.name, nature: p.nature, name: p.name, unit: p.unit, priceMin: p.priceMin, price: p.price, priceLocked: p.priceLocked, active: p.active, fvItemId: p.fvItemId, updated: productUpdatedAt })
      .from(p)
      .innerJoin(s, eq(s.id, p.supplierId))
      .orderBy(asc(s.name), asc(p.name)),
    db.select().from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
    db.select({ id: s.id, name: s.name }).from(s).where(eq(s.active, true)).orderBy(asc(s.name)),
    db.select().from(schema.fvItems),
  ]);
  // Fruits et légumes : prix du mois en cours et prix bloqué repris de leur onglet
  const month = parisMonth(new Date());
  const fvById = new Map(fvItems.map((f) => [f.id, f]));
  const rows = all.map((r) => {
    const fv = r.fvItemId ? fvById.get(r.fvItemId) : undefined;
    const range = fv ? fvRange(fv.prices, month) : { min: num(r.priceMin), max: num(r.price) };
    return { ...r, priceMin: range.min, price: range.max, priceLocked: fv ? fv.locked : r.priceLocked, fv: !!fv };
  });
  const split = (v: string | null) => (v ?? "").split(/,\s*/).filter(Boolean);
  const natures = [...new Set(rows.filter((r) => r.active).flatMap((r) => split(r.nature)))].sort((a, b) => a.localeCompare(b, "fr"));
  const editable = can.editMercurial(user.role);

  return (
    <>
      <PageHeader title={t.mercurial.title}>
        <a className="btn-secondary" href="/api/export/mercurial"><Icon name="download" className="h-4 w-4" /> {t.common.exportCsv}</a>
      </PageHeader>
      <p className="-mt-3 mb-4 text-sm text-stone-600">{t.mercurial.intro}</p>
      {editable && (
        <div className="mb-4 grid items-start gap-4 xl:grid-cols-[3fr_1fr]">
          <AddRow suppliers={supplierRows} units={units.map((u) => u.name)} natures={natures} existing={rows.filter((r) => r.active).map((r) => ({ supplierId: r.supplierId, name: r.name }))} />
          <UnitsPanel units={units.map((u) => ({ id: u.id, name: u.name }))} />
        </div>
      )}
      <MercurialTable rows={rows} suppliers={supplierRows} units={units.map((u) => u.name)} natures={natures} editable={editable} />
    </>
  );
}
