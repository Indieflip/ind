import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { Empty, PageHeader } from "@/components/ui";
import { supplierDuplicates } from "@/lib/supplierDuplicates";
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
  // Comptes en double possibles, parmi tous les fournisseurs (actifs ou non)
  const everyone = await getDb().select({ id: s.id, name: s.name, active: s.active }).from(s);
  const duplicates = supplierDuplicates(everyone);

  return (
    <>
      <PageHeader title={`${t.suppliers.title} · ${t.suppliers.mercurial}`} />
      {(editable || can.createSupplier(user.role)) && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {can.createSupplier(user.role) && <AddSupplier />}
          {editable && <ImportCatalog />}
        </div>
      )}
      {duplicates.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">⚠ {t.suppliers.duplicatesTitle} ({duplicates.length})</h2>
          <p className="mb-2 text-xs text-amber-900/80">{t.suppliers.duplicatesHint}</p>
          <ul className="space-y-1">
            {duplicates.map((g) => (
              <li key={g[0].id} className="flex flex-wrap items-center gap-2">
                {g.map((x, i) => (
                  <span key={x.id} className="flex items-center gap-2">
                    {i > 0 && <span className="text-amber-700">≈</span>}
                    <Link href={`/mercurial/fournisseurs/${x.id}`} className="font-medium underline">{x.name}</Link>
                    {!x.active && <span className="badge bg-stone-200 text-stone-700">{t.suppliers.inactive}</span>}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
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
                  <div className="truncate font-semibold"><span className="mr-1.5 text-xs font-semibold text-stone-400">N° {r.id}</span>{r.name}</div>
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
