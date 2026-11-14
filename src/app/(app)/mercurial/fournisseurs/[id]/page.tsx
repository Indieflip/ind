import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/DecisionBadge";
import { AddProduct, ProductRow, SupplierInfo } from "../SupplierClient";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(can.viewSuppliers);
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const db = getDb();
  const supplier = Number.isInteger(id) ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) }) : undefined;
  if (!supplier) notFound();
  const [products, cats, recents, unitRows, supplierAnomalies] = await Promise.all([
    db.select().from(schema.products).where(eq(schema.products.supplierId, id)).orderBy(desc(schema.products.active), asc(schema.products.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    db.select().from(schema.receptions).where(eq(schema.receptions.supplierId, id)).orderBy(desc(schema.receptions.deliveredAt)).limit(10),
    db.select({ name: schema.units.name }).from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
    db.select().from(schema.anomalies).where(eq(schema.anomalies.supplierId, id)).orderBy(desc(schema.anomalies.createdAt)).limit(100),
  ]);
  const units = unitRows.map((u) => u.name);
  const categories = cats.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr }));
  const editable = can.editSuppliers(user.role);

  return (
    <div className="space-y-4">
      <Link href="/mercurial/fournisseurs" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.suppliers.title}</Link>
      <h1 className="text-2xl font-bold">{supplier.name}</h1>
      {editable && (
        <SupplierInfo id={supplier.id} name={supplier.name} email={supplier.email ?? ""} phone={supplier.phone ?? ""} notes={supplier.notes ?? ""} active={supplier.active} />
      )}
      {editable && <AddProduct supplierId={supplier.id} categories={categories} units={units} />}
      <datalist id="units-list">{units.map((u) => <option key={u} value={u} />)}</datalist>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t.common.product}</th>
              <th>{t.common.unit}</th>
              <th>{t.mercurial.nature}</th>
              <th className="text-right">{t.mercurial.priceMin}</th>
              <th className="text-right">{t.mercurial.priceMax}</th>
              <th className="text-right">{t.mercurial.priceRange}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => <ProductRow key={p.id} p={p} editable={editable} />)}
          </tbody>
        </table>
      </div>
      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">{t.mercurial.supplierAnomalies} <span className="text-sm font-normal text-stone-500">({supplierAnomalies.filter((a) => a.status !== "closed").length} {t.anomalies.openCount})</span></h2>
          <Link href={`/anomalies?supplier=${supplier.id}&status=`} className="text-sm text-brand-700 underline">{t.nav.anomalies} →</Link>
        </div>
        {supplierAnomalies.length === 0 ? (
          <p className="text-sm text-stone-500">{t.mercurial.noAnomalies}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {supplierAnomalies.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-stone-500">{fmtDateTime(a.createdAt, locale).split(" ")[0]}</span>
                <span className="badge bg-stone-100 text-stone-700">{t.anomalies.types[a.type]}</span>
                <span className="min-w-0 flex-1">{a.description}</span>
                <StatusBadge status={a.status} label={t.anomalies.statuses[a.status]} />
                {a.receptionId && <Link href={`/receptions/${a.receptionId}`} className="text-brand-700">→</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </div>
  );
}
