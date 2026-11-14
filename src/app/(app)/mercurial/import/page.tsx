import { requireUser } from "@/lib/auth";

// Import de ~2 000 lignes vers Neon : on laisse le temps à la fonction Vercel
export const maxDuration = 300;
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { ImportForm } from "./ImportForm";

export default async function ImportPage() {
  await requireUser(can.importFile);
  const { t, locale } = await getDict();
  const history = await getDb()
    .select({ id: schema.imports.id, createdAt: schema.imports.createdAt, fileName: schema.imports.fileName, products: schema.imports.products, suppliers: schema.imports.suppliers, by: schema.users.name })
    .from(schema.imports)
    .leftJoin(schema.users, eq(schema.users.id, schema.imports.createdBy))
    .orderBy(desc(schema.imports.createdAt))
    .limit(50);
  const m = t.mercurial;
  return (
    <>
      <PageHeader title={m.importTitle} />
      <ImportForm />
      <section className="card mt-6 max-w-4xl overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{m.importHistory}</h2>
        {history.length === 0 ? (
          <p className="p-4 text-sm text-stone-500">—</p>
        ) : (
          <table className="table mt-2">
            <thead>
              <tr><th>{m.importDate}</th><th>{m.importFile}</th><th className="text-right">{m.importProducts}</th><th className="text-right">{m.importSuppliers}</th><th>{m.importBy}</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(h.createdAt, locale)}</td>
                  <td>{h.fileName}</td>
                  <td className="text-right tabular-nums">{h.products ?? "—"}</td>
                  <td className="text-right tabular-nums">{h.suppliers ?? "—"}</td>
                  <td className="text-stone-600">{h.by ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
