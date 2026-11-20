import { asc, eq, isNotNull } from "drizzle-orm";
import { syncMajPrices } from "@/lib/server/priceSync";
import { ensureMajNormalized } from "@/lib/server/maj";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MajLog } from "./MajLog";

/** Mercurial > Mise à jour Mercurial : historique des modifications (ex-« Suivi MAJ ») */
export default async function MercurialUpdatesPage() {
  const user = await requireUser(can.viewMercurial);
  await ensureMajNormalized();
  await syncMajPrices();
  const m = schema.majLog;
  const linked = await getDb().select({ majId: schema.priceChanges.majId, supplierId: schema.priceChanges.supplierId, date: schema.priceChanges.date }).from(schema.priceChanges).where(isNotNull(schema.priceChanges.majId));
  const price = new Map(linked.map((l) => [l.majId, l]));
  const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
  const rows = await getDb()
    .select({ r: m, supplier: schema.suppliers.name, product: schema.products.name })
    .from(m)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, m.supplierId))
    .leftJoin(schema.products, eq(schema.products.id, m.productId))
    .orderBy(asc(m.position));
  const products = await getDb()
    .select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId, supplier: schema.suppliers.name })
    .from(schema.products)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.products.supplierId))
    .orderBy(asc(schema.products.name));
  return (
    <MajLog
      products={products}
      rows={rows.map(({ r, supplier, product }) => ({
        id: r.id, date: r.date, nature: r.nature, item: product ?? r.item, original: product && product !== r.item ? r.item : null,
        detail: r.detail, supplier: supplier ?? null, supplierId: r.supplierId, productId: r.productId, reference: r.reference, claim: r.claim,
        priceHref: price.has(r.id) ? `/reporting/prix?${new URLSearchParams({ from: day(price.get(r.id)!.date), to: day(price.get(r.id)!.date), ...(price.get(r.id)!.supplierId ? { supplier: String(price.get(r.id)!.supplierId) } : {}) })}` : null,
      }))}
      editable={can.editPrices(user.role)}
    />
  );
}
