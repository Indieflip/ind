import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtMoney, sentence } from "@/lib/format";
import { one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";

const FREQS = { semaine: { unit: "week", count: 12 }, mois: { unit: "month", count: 12 }, trimestre: { unit: "quarter", count: 8 }, annee: { unit: "year", count: 4 } } as const;
type Freq = keyof typeof FREQS;

/** Reporting > Achats : montant des achats par fournisseur, par semaine, mois, trimestre ou année (réceptions saisies dans l'application) */
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(can.viewMercurial);
  const { t, locale } = await getDict();
  const A = t.purchases;
  const sp = await searchParams;
  const freq: Freq = (one(sp.f) as Freq) in FREQS ? (one(sp.f) as Freq) : "mois";
  const { unit, count } = FREQS[freq];
  const step = sql.raw(`interval '${unit === "quarter" ? "3 months" : `1 ${unit}`}'`);
  // Achats = Q facturée (ou contrôlée à défaut) × prix unitaire, produits refusés exclus
  const rows = await getDb().execute<{ period: string; supplier_id: number | null; supplier: string | null; amount: string; receptions: number }>(sql`
    with periods as (
      select generate_series(date_trunc(${unit}, (now() at time zone 'Europe/Paris')) - (${count - 1}::int * ${step}), date_trunc(${unit}, (now() at time zone 'Europe/Paris')), ${step}) as p
    )
    select to_char(date_trunc(${unit}, r.delivered_at at time zone 'Europe/Paris'), 'YYYY-MM-DD') as period, r.supplier_id, s.name as supplier,
           sum(coalesce(l.qty_ordered, l.qty_received, 0) * coalesce(l.unit_price, 0))::text as amount,
           count(distinct r.id)::int as receptions
    from receptions r
    join reception_lines l on l.reception_id = r.id
    left join suppliers s on s.id = r.supplier_id
    where l.decision <> 'refuse'
      and r.delivered_at at time zone 'Europe/Paris' >= (select min(p) from periods)
    group by 1, 2, 3
  `);
  const periods: string[] = [];
  {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const start = (d: Date) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (unit === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      if (unit === "month") x.setDate(1);
      if (unit === "quarter") { x.setDate(1); x.setMonth(Math.floor(x.getMonth() / 3) * 3); }
      if (unit === "year") { x.setDate(1); x.setMonth(0); }
      return x;
    };
    const cur = start(now);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(cur);
      if (unit === "week") d.setDate(d.getDate() - 7 * i);
      if (unit === "month") d.setMonth(d.getMonth() - i);
      if (unit === "quarter") d.setMonth(d.getMonth() - 3 * i);
      if (unit === "year") d.setFullYear(d.getFullYear() - i);
      periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }
  const label = (p: string) => {
    const d = new Date(`${p}T12:00:00`);
    if (unit === "week") return `${A.weekOf} ${d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}`;
    if (unit === "month") return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
    if (unit === "quarter") return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    return String(d.getFullYear());
  };
  const bySupplier = new Map<string, { id: number | null; name: string; cells: Map<string, number>; total: number; receptions: number }>();
  for (const r of rows.rows) {
    const key = String(r.supplier_id ?? "none");
    const e = bySupplier.get(key) ?? { id: r.supplier_id, name: r.supplier ? sentence(r.supplier) : A.noSupplier, cells: new Map(), total: 0, receptions: 0 };
    const v = Number(r.amount) || 0;
    e.cells.set(r.period, (e.cells.get(r.period) ?? 0) + v);
    e.total += v;
    e.receptions += r.receptions;
    bySupplier.set(key, e);
  }
  const list = [...bySupplier.values()].filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const grand = list.reduce((s, x) => s + x.total, 0);
  const colTotal = (p: string) => list.reduce((s, x) => s + (x.cells.get(p) ?? 0), 0);
  const money = (n: number) => fmtMoney(n, locale);
  const max = Math.max(1, ...periods.map(colTotal));

  return (
    <>
      <PageHeader title={A.title} />
      <p className="-mt-3 mb-4 max-w-3xl text-sm text-stone-600">{A.intro}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-stone-600">{A.frequency} :</span>
        {(Object.keys(FREQS) as Freq[]).map((f) => (
          <Link key={f} href={`/reporting/achats?f=${f}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${f === freq ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}>{A.freqs[f]}</Link>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wider text-stone-500">{A.total}</p><p className="text-2xl font-bold tabular-nums">{money(grand)}</p><p className="text-xs text-stone-500">{label(periods[0])} → {label(periods[periods.length - 1])}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wider text-stone-500">{A.suppliers}</p><p className="text-2xl font-bold tabular-nums">{list.length}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wider text-stone-500">{A.top}</p><p className="truncate text-2xl font-bold">{list[0]?.name ?? "—"}</p><p className="text-xs text-stone-500">{list[0] ? `${money(list[0].total)} · ${Math.round((list[0].total / grand) * 100)} %` : ""}</p></div>
      </div>

      {/* Évolution du total par période */}
      <div className="card mb-4 p-4">
        <div className="flex h-32 items-end gap-1.5">
          {periods.map((p) => (
            <div key={p} className="flex h-full flex-1 flex-col justify-end" title={`${label(p)} : ${money(colTotal(p))}`}>
              <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max(2, (colTotal(p) / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">{periods.map((p) => <span key={p} className="flex-1 truncate text-center text-[10px] text-stone-500">{label(p)}</span>)}</div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-stone-50">{t.common.supplier}</th>
              {periods.map((p) => <th key={p} className="whitespace-nowrap text-right">{label(p)}</th>)}
              <th className="text-right">{A.total}</th>
              <th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={String(x.id)}>
                <td className="sticky left-0 bg-white font-medium">{x.id ? <Link href={`/mercurial/fournisseurs/${x.id}`} className="hover:text-brand-700 hover:underline">{x.name}</Link> : x.name}</td>
                {periods.map((p) => <td key={p} className="whitespace-nowrap text-right tabular-nums text-stone-700">{x.cells.get(p) ? money(x.cells.get(p)!) : <span className="text-stone-300">—</span>}</td>)}
                <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(x.total)}</td>
                <td className="text-right tabular-nums text-stone-500">{grand ? Math.round((x.total / grand) * 100) : 0} %</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={periods.length + 3} className="py-8 text-center text-stone-500">{A.empty}</td></tr>}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr className="bg-stone-50 font-bold">
                <td className="sticky left-0 bg-stone-50">{A.total}</td>
                {periods.map((p) => <td key={p} className="whitespace-nowrap text-right tabular-nums">{money(colTotal(p))}</td>)}
                <td className="whitespace-nowrap text-right tabular-nums">{money(grand)}</td>
                <td className="text-right">100 %</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-3 text-xs text-stone-500">{A.note}</p>
    </>
  );
}
