import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime, num } from "@/lib/format";
import { fvRange, parisMonth } from "@/lib/pricing";
import { one, type SP } from "@/lib/server/queries";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/DecisionBadge";
import { AddProduct, SupplierAnomalies, SupplierInfo, SupplierSearch } from "../SupplierClient";
import { MercurialTable } from "../../MercurialClient";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewSuppliers);
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const tab = one((await searchParams).tab) === "anomalies" ? "anomalies" : "products";
  const db = getDb();
  const supplier = Number.isInteger(id) ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) }) : undefined;
  if (!supplier) notFound();
  const [products, cats, recents, unitRows, supplierAnomalies, allSuppliers, fvItems] = await Promise.all([
    db.select().from(schema.products).where(eq(schema.products.supplierId, id)).orderBy(asc(schema.products.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    db.select().from(schema.receptions).where(eq(schema.receptions.supplierId, id)).orderBy(desc(schema.receptions.deliveredAt)).limit(10),
    db.select({ name: schema.units.name }).from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
    db.select().from(schema.anomalies).where(eq(schema.anomalies.supplierId, id)).orderBy(desc(schema.anomalies.createdAt)),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name)),
    db.select().from(schema.fvItems),
  ]);
  const units = unitRows.map((u) => u.name);
  const categories = cats.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr }));
  const editable = can.editSuppliers(user.role);
  const month = parisMonth(new Date());
  const fvById = new Map(fvItems.map((f) => [f.id, f]));
  // Même tableau que Mercurial > Produits : une modification ici est la même que là-bas
  const rows = products.map((p) => {
    const fv = p.fvItemId ? fvById.get(p.fvItemId) : undefined;
    const range = fv ? fvRange(fv.prices, month) : { min: num(p.priceMin), max: num(p.price) };
    return {
      id: p.id, supplierId: p.supplierId, supplier: supplier.name, nature: p.nature, name: p.name, unit: p.unit,
      priceMin: range.min, price: range.max, priceLocked: fv ? fv.locked : p.priceLocked, active: p.active, fv: !!fv,
    };
  });
  const natures = [...new Set(rows.flatMap((r) => (r.nature ?? "").split(/,\s*/).filter(Boolean)))].sort((a, b) => a.localeCompare(b, "fr"));
  const openAnomalies = supplierAnomalies.filter((a) => a.status !== "closed").length;
  const tabCls = (on: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${on ? "border-brand-600 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/mercurial/fournisseurs" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.suppliers.title}</Link>
        <div className="w-full max-w-xs"><SupplierSearch suppliers={allSuppliers} /></div>
      </div>
      <h1 className="text-2xl font-bold">{supplier.name}</h1>
      <nav className="flex gap-1 border-b border-stone-200">
        <Link href={`/mercurial/fournisseurs/${id}`} className={tabCls(tab === "products")}>{t.mercurial.tabProducts} ({rows.filter((r) => r.active).length})</Link>
        <Link href={`/mercurial/fournisseurs/${id}?tab=anomalies`} className={tabCls(tab === "anomalies")}>{t.nav.anomalies} ({openAnomalies})</Link>
      </nav>

      {tab === "products" ? (
        <>
          {editable && (
            <SupplierInfo id={supplier.id} name={supplier.name} email={supplier.email ?? ""} phone={supplier.phone ?? ""} notes={supplier.notes ?? ""} active={supplier.active} />
          )}
          {editable && <AddProduct supplierId={supplier.id} categories={categories} units={units} />}
          <h2 className="pt-2 text-lg font-semibold">{t.suppliers.productList}</h2>
          <MercurialTable rows={rows} suppliers={allSuppliers} units={units} natures={natures} editable={editable} />
          {recents.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 font-semibold">{t.suppliers.lastReceptions}</h2>
              <ul className="divide-y divide-stone-100">
                {recents.map((r) => (
                  <li key={r.id}>
                    <Link href={`/receptions/${r.id}`} className="flex items-center justify-between py-2 text-sm hover:text-brand-700">
                      <span>{fmtDateTime(r.deliveredAt, locale)} · {r.blNumber ?? "—"}</span>
                      <StatusBadge status={r.status} label={t.receptionStatus[r.status]} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <SupplierAnomalies
          supplierId={supplier.id}
          rows={supplierAnomalies.map((a) => ({
            id: a.id, date: fmtDateTime(a.createdAt, locale), dateSort: a.createdAt.toISOString(),
            type: t.anomalies.types[a.type], product: a.productName ?? "", description: a.description,
            status: a.status, statusLabel: t.anomalies.statuses[a.status], receptionId: a.receptionId,
          }))}
        />
      )}
    </div>
  );
}
