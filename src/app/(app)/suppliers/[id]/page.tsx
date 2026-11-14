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
  const [products, cats, recents] = await Promise.all([
    db.select().from(schema.products).where(eq(schema.products.supplierId, id)).orderBy(desc(schema.products.active), asc(schema.products.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    db.select().from(schema.receptions).where(eq(schema.receptions.supplierId, id)).orderBy(desc(schema.receptions.deliveredAt)).limit(10),
  ]);
  const categories = cats.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr }));
  const editable = can.editSuppliers(user.role);

  return (
    <div className="space-y-4">
      <Link href="/suppliers" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.suppliers.title}</Link>
      <h1 className="text-2xl font-bold">{supplier.name}</h1>
      {editable && (
        <SupplierInfo id={supplier.id} name={supplier.name} email={supplier.email ?? ""} phone={supplier.phone ?? ""} notes={supplier.notes ?? ""} active={supplier.active} />
      )}
      {editable && <AddProduct supplierId={supplier.id} categories={categories} />}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t.common.product}</th>
              <th>{t.common.unit}</th>
              <th>{t.common.category}</th>
              <th className="text-right">{t.wizard.mercurial}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => <ProductRow key={p.id} p={p} categories={categories} editable={editable} />)}
          </tbody>
        </table>
      </div>
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
