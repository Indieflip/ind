import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { Empty, PageHeader } from "@/components/ui";
import { AddSupplier, ImportCatalog, SupplierSearch } from "./SupplierClient";

export default async function SuppliersPage() {
  const user = await requireUser(can.viewSuppliers);
  const { t } = await getDict();
  const s = schema.suppliers;
  const rows = await getDb()
    .select({
      id: s.id,
      name: s.name,
      active: s.active,
      // Colonne qualifiée : sans « suppliers. », l'id serait celui du produit dans la sous-requête
      products: sql<number>`(select count(*)::int from products p where p.supplier_id = "suppliers"."id" and p.active)`,
    })
    .from(s)
    .where(eq(s.active, true))
    .orderBy(asc(s.name));
  const editable = can.editSuppliers(user.role);

  return (
    <>
      <PageHeader title={`${t.suppliers.title} · ${t.suppliers.mercurial}`} />
      {editable && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <AddSupplier />
          <ImportCatalog />
        </div>
      )}
      <div className="no-print mb-4 max-w-sm"><SupplierSearch suppliers={rows.map((r) => ({ id: r.id, name: r.name }))} /></div>
      {rows.length === 0 ? (
        <Empty>{t.suppliers.empty}</Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/mercurial/fournisseurs/${r.id}`} className={`card flex items-center justify-between gap-2 p-4 hover:border-brand-500 ${r.active ? "" : "opacity-50"}`}>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="text-xs text-stone-500">{r.products} {t.suppliers.productsCount}{!r.active && ` · ${t.suppliers.inactive}`}</div>
                </div>
                <span className="text-stone-300">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
