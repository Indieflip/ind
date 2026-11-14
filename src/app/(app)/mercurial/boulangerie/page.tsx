import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, fmtNum, num } from "@/lib/format";
import { BAKERY_ITEMS, getBakeryPrices, getBakerySupplier } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { AddBakeryRow, BakeryPrices, DeleteBakeryRow } from "./BakeryClient";

export default async function BakeryPage() {
  const user = await requireUser(can.viewMercurial);
  const { t, locale } = await getDict();
  const b = t.bakery;
  const [entries, prices, supplier, suppliers] = await Promise.all([
    getDb().select().from(schema.bakeryEntries).orderBy(asc(schema.bakeryEntries.date)),
    getBakeryPrices(),
    getBakerySupplier(),
    getDb().select({ name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);
  const editable = can.editMercurial(user.role);

  // Regroupement par mois, le plus récent en premier
  const months = new Map<string, typeof entries>();
  for (const e of entries) {
    const m = e.date.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), e]);
  }
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(m + "-15"));

  return (
    <>
      <PageHeader title={b.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-stone-600">{b.intro}</p>
      <BakeryPrices prices={prices} supplier={supplier} suppliers={suppliers.map((s) => s.name)} editable={editable} />
      {editable && <AddBakeryRow />}

      {months.size === 0 ? (
        <p className="card p-6 text-center text-sm text-stone-500">{b.empty}</p>
      ) : (
        <div className="space-y-6">
          {[...months.entries()].reverse().map(([m, rows], idx) => {
            const totals = Object.fromEntries(BAKERY_ITEMS.map((k) => [k, rows.reduce((s, r) => s + (num(r[k]) ?? 0), 0)])) as Record<(typeof BAKERY_ITEMS)[number], number>;
            const amount = BAKERY_ITEMS.reduce((s, k) => s + totals[k] * (prices[k] ?? 0), 0);
            return (
              <details key={m} open={idx === 0} className="card overflow-x-auto [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-baseline justify-between gap-2 px-4 py-4">
                  <h2 className="font-semibold capitalize">▸ {monthLabel(m)} <span className="text-sm font-normal text-stone-500">· {rows.length} j · {BAKERY_ITEMS.map((k) => `${b[k]} ${fmtNum(totals[k], locale)}`).join(" · ")}</span></h2>
                  {amount > 0 && <span className="font-semibold tabular-nums">{fmtMoney(amount, locale)} HT</span>}
                </summary>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{b.date}</th>
                      {BAKERY_ITEMS.map((k) => <th key={k} className="text-right">{b[k]}</th>)}
                      <th>{b.bl}</th>
                      {editable && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{fmtDate(r.date, locale)}</td>
                        {BAKERY_ITEMS.map((k) => <td key={k} className="text-right tabular-nums">{r[k] != null ? fmtNum(r[k], locale) : ""}</td>)}
                        <td>{r.receptionId ? <Link className="text-brand-700 hover:underline" href={`/receptions/${r.receptionId}`}>→</Link> : <span className="text-xs text-stone-400">import / manuel</span>}</td>
                        {editable && <td className="text-right">{!r.receptionId && <DeleteBakeryRow id={r.id} />}</td>}
                      </tr>
                    ))}
                    <tr className="bg-stone-50 font-semibold">
                      <td>{b.total}</td>
                      {BAKERY_ITEMS.map((k) => <td key={k} className="text-right tabular-nums">{fmtNum(totals[k], locale)}</td>)}
                      <td colSpan={editable ? 2 : 1} />
                    </tr>
                    {amount > 0 && (
                      <tr className="bg-stone-50 text-sm text-stone-600">
                        <td>{t.mercurial.priceHt}</td>
                        {BAKERY_ITEMS.map((k) => <td key={k} className="text-right tabular-nums">{prices[k] != null ? fmtMoney(totals[k] * prices[k]!, locale) : "—"}</td>)}
                        <td colSpan={editable ? 2 : 1} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
