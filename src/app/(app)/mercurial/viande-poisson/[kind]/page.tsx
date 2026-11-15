import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { SubTabs } from "@/components/SubTabs";
import { MeatFishTable } from "../MeatFishTable";

export default async function MeatFishPage({ params }: { params: Promise<{ kind: string }> }) {
  await requireUser(can.viewMercurial);
  const { t } = await getDict();
  const { kind } = await params;
  if (kind !== "viande" && kind !== "poisson") notFound();
  const rows = await getDb().select().from(schema.meatFishEntries).where(eq(schema.meatFishEntries.kind, kind)).orderBy(asc(schema.meatFishEntries.date));
  const mf = t.meatFish;
  return (
    <>
      <SubTabs tabs={[{ href: "/mercurial/viande-poisson/viande", label: mf.meat }, { href: "/mercurial/viande-poisson/poisson", label: mf.fish }]} />
      <h1 className="text-2xl font-bold tracking-tight">{kind === "viande" ? mf.meat : mf.fish} · {mf.title}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-stone-600">{mf.intro} {mf.clickDay}</p>
      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-stone-500">{mf.empty} {mf.importHint}</p>
      ) : (
        <MeatFishTable rows={rows.map((r) => ({ id: r.id, date: r.date, product: r.product, unit: r.unit ?? "", qty: num(r.qty) ?? 0, fromBl: !!r.receptionId, receptionId: r.receptionId, supplier: r.supplierName ?? "" }))} />
      )}
    </>
  );
}
