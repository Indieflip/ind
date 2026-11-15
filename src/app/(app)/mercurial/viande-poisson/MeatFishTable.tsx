"use client";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fmtNum } from "@/lib/format";
import { matches } from "@/lib/search";
import { FilterInput, ResetFilters } from "@/components/table/FilterInput";

interface Entry { id: number; date: string; product: string; unit: string; qty: number; fromBl: boolean }

/** Tableau mensuel : une ligne par produit, une colonne par jour livré, total du mois */
export function MeatFishTable({ rows }: { rows: Entry[] }) {
  const { t, locale } = useI18n();
  const mf = t.meatFish;
  const months = useMemo(() => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(), [rows]);
  const current = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(months.includes(current) ? current : months[0]);
  const [f, setF] = useState("");
  const monthLabel = (m: string) => {
    const s = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(m + "-15"));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const inMonth = rows.filter((r) => r.date.startsWith(month));
  const terms = f.split("|").map((x) => x.trim()).filter(Boolean);
  const filtered = inMonth.filter((r) => !terms.length || terms.some((q) => matches(r.product, q)));
  // Seuls les jours avec des livraisons sont affichés (le tableau tient dans la page)
  const days = [...new Set(filtered.map((r) => Number(r.date.slice(8, 10))))].sort((a, b) => a - b);
  const products = new Map<string, { product: string; unit: string; byDay: Map<number, number>; total: number; fromBl: boolean }>();
  for (const r of filtered) {
    const k = `${r.product.toLowerCase()}|${r.unit}`;
    const p = products.get(k) ?? { product: r.product, unit: r.unit, byDay: new Map(), total: 0, fromBl: false };
    const d = Number(r.date.slice(8, 10));
    p.byDay.set(d, (p.byDay.get(d) ?? 0) + r.qty);
    p.total += r.qty;
    p.fromBl ||= r.fromBl;
    products.set(k, p);
  }
  const list = [...products.values()].sort((a, b) => a.product.localeCompare(b.product, "fr"));
  const dayTotal = (d: number) => list.reduce((s, p) => s + (p.byDay.get(d) ?? 0), 0);
  const grand = list.reduce((s, p) => s + p.total, 0);
  const n = (v: number) => fmtNum(v, locale, 3);
  /** Affichage compact dans les colonnes de jours (valeur exacte au survol) */
  const short = (v: number) => fmtNum(v, locale, v >= 100 ? 0 : v >= 10 ? 1 : 2);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          {mf.month}
          <select className="input w-48 py-1.5" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <span className="text-stone-500">{list.length} {t.mercurial.count} · {mf.total} {n(grand)} kg</span>
      </div>
      <div className="card overflow-hidden">
        <div className="max-h-[75vh] overflow-y-auto">
          <table className="table table-fixed text-[11px] [&_td]:px-1 [&_th]:px-1 [&_th]:text-[11px]">
            <colgroup>
              <col className="w-[14%]" /><col className="w-[4%]" />
              {days.map((d) => <col key={d} />)}
              <col className="w-[8%]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-56">{mf.product}</th>
                <th className="w-12">{t.common.unit}</th>
                {days.map((d) => <th key={d} className="text-right">{d}</th>)}
                <th className="text-right">{mf.total}</th>
              </tr>
              <tr>
                <th className="bg-white py-1.5"><FilterInput value={f} onChange={setF} options={[...new Set(inMonth.map((r) => r.product))]} /></th>
                <th className="bg-white" colSpan={days.length + 1} />
                <th className="bg-white py-1.5 text-right"><ResetFilters active={!!f} onClick={() => setF("")} /></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={days.length + 3} className="py-6 text-center text-stone-500">{mf.empty}</td></tr>}
              {list.map((p) => (
                <tr key={p.product + p.unit} className="hover:bg-stone-50">
                  <td className="font-medium">{p.product}{p.fromBl && <span className="ml-1 text-[10px] text-brand-700" title={mf.fromBl}>●</span>}</td>
                  <td className="text-stone-500">{p.unit}</td>
                  {days.map((d) => <td key={d} className="overflow-hidden whitespace-nowrap text-right text-[10px] tabular-nums [overflow-wrap:normal]" title={p.byDay.has(d) ? `${d} : ${n(p.byDay.get(d)!)} ${p.unit}` : undefined}>{p.byDay.has(d) ? short(p.byDay.get(d)!) : ""}</td>)}
                  <td className="text-right font-semibold tabular-nums">{n(p.total)}</td>
                </tr>
              ))}
            </tbody>
            {list.length > 0 && (
              <tfoot className="sticky bottom-0 bg-stone-50 font-semibold">
                <tr>
                  <td>{mf.total}</td>
                  <td />
                  {days.map((d) => <td key={d} className="overflow-hidden whitespace-nowrap text-right text-[10px] tabular-nums [overflow-wrap:normal]" title={n(dayTotal(d))}>{short(dayTotal(d))}</td>)}
                  <td className="text-right tabular-nums">{n(grand)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs text-stone-500"><span className="text-brand-700">●</span> {mf.fromBl}</p>
    </>
  );
}
