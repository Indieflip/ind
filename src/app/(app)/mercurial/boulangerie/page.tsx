import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { getBakeryPrices, getBakerySupplier } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { BakeryProducts, BakeryTable } from "./BakeryClient";

export default async function BakeryPage() {
  const user = await requireUser(can.viewMercurial);
  const { t } = await getDict();
  const b = t.bakery;
  const [entries, prices, supplier, suppliers] = await Promise.all([
    getDb().select().from(schema.bakeryEntries).orderBy(asc(schema.bakeryEntries.date)),
    getBakeryPrices(),
    getBakerySupplier(),
    getDb().select({ name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);
  const editable = can.editMercurial(user.role);
  return (
    <>
      <PageHeader title={b.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-stone-600">{b.intro}</p>
      <BakeryProducts prices={prices} supplier={supplier} suppliers={suppliers.map((s) => s.name)} editable={editable} />
      {entries.length === 0 ? (
        <p className="card p-6 text-center text-sm text-stone-500">{b.empty}</p>
      ) : (
        <BakeryTable
          rows={entries.map((e) => ({
            id: e.id, date: e.date, receptionId: e.receptionId, remark: e.remark,
            baguette: num(e.baguette), hamburger: num(e.hamburger), rolls: num(e.rolls), painDeMie: num(e.painDeMie),
          }))}
          prices={prices}
          editable={editable}
        />
      )}
    </>
  );
}
