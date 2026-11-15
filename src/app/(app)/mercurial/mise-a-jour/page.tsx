import { asc, eq } from "drizzle-orm";
import { ensureMajNormalized } from "@/lib/server/maj";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MajLog } from "./MajLog";

/** Mercurial > Mise à jour Mercurial : historique des modifications (ex-« Suivi MAJ ») */
export default async function MercurialUpdatesPage() {
  const user = await requireUser(can.viewMercurial);
  await ensureMajNormalized();
  const m = schema.majLog;
  const rows = await getDb()
    .select({ r: m, supplier: schema.suppliers.name, product: schema.products.name })
    .from(m)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, m.supplierId))
    .leftJoin(schema.products, eq(schema.products.id, m.productId))
    .orderBy(asc(m.position));
  return (
    <MajLog
      rows={rows.map(({ r, supplier, product }) => ({
        id: r.id, date: r.date, nature: r.nature, item: product ?? r.item, original: product && product !== r.item ? r.item : null,
        detail: r.detail, supplier: supplier ?? null, supplierId: r.supplierId, reference: r.reference, claim: r.claim,
      }))}
      editable={can.editPrices(user.role)}
    />
  );
}
