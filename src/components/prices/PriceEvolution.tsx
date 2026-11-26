"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";

export type PricePoint = { date: string; price: number; href?: string | null };
type Period = 1 | 3 | 6 | 12;

const day = (iso: string) => iso.slice(0, 10);
const since = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10); };
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const pctText = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(1).replace(".", ",")} %`;

/** Courbe SVG simple (axe des dates proportionnel) ; clic sur un point : sa fiche */
export function LineChart({ points, color, format, base }: { points: { date: string; value: number; href?: string | null; label?: string }[]; color: string; format: (v: number) => string; base?: number }) {
  const router = useRouter();
  if (points.length < 2) return null;
  const W = 640, H = 220, L = 56, R = 18, T = 22, B = 28;
  const vals = points.map((p) => p.value).concat(base != null ? [base] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || Math.max(1, hi * 0.05);
  lo -= pad; hi += pad;
  const t0 = new Date(points[0].date).getTime(), t1 = new Date(points[points.length - 1].date).getTime(), span = t1 - t0 || 1;
  const X = (d: string) => L + ((new Date(d).getTime() - t0) / span) * (W - L - R);
  const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  // Dates affichées sans chevauchement (au moins 56 px entre deux)
  const xLabels: string[] = [];
  let lastX = -Infinity;
  for (const p of points) { const x = X(p.date); if (x - lastX >= 56) { xLabels.push(p.date); lastX = x; } }
  const path = points.map((p, i) => `${i ? "L" : "M"}${X(p.date).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#e7e5e4" />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end" className="fill-stone-500 text-[11px]">{format(v)}</text>
        </g>
      ))}
      {base != null && <line x1={L} x2={W - R} y1={Y(base)} y2={Y(base)} stroke="#a8a29e" strokeDasharray="4 4" />}
      {xLabels.map((d) => <text key={d} x={X(d)} y={H - 8} textAnchor="middle" className="fill-stone-500 text-[11px]">{points.find((p) => p.date === d)?.label ?? ddmm(d)}</text>)}
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={X(p.date)} cy={Y(p.value)} r={4.5} fill="white" stroke={color} strokeWidth={2} className={p.href ? "cursor-pointer" : ""} onClick={() => p.href && router.push(p.href)}>
          <title>{`${p.label ?? ddmmyy(p.date)} : ${format(p.value)}`}</title>
        </circle>
      ))}
      <text x={Math.min(X(last.date), W - R - 4)} y={Y(last.value) - 10} textAnchor="end" className="text-[12px] font-bold" fill={color}>{format(last.value)}</text>
    </svg>
  );
}

function Periods({ value, onChange, options }: { value: Period; onChange: (p: Period) => void; options: Period[] }) {
  const { t } = useI18n();
  const P = t.priceEvolution;
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${value === o ? "border-brand-600 bg-brand-600 text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`}>
          {o === 12 ? P.year : `${o} ${P.months}`}
        </button>
      ))}
    </div>
  );
}

const Kpi = ({ label, value, cls = "" }: { label: string; value: string; cls?: string }) => (
  <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2">
    <p className="text-xs text-stone-500">{label}</p>
    <p className={`text-base font-bold tabular-nums ${cls}`}>{value}</p>
  </div>
);
const Tag = ({ p }: { p: number }) => (Math.abs(p) < 0.05 ? <span className="text-stone-400">=</span> : <span className={`badge whitespace-nowrap font-semibold ${p > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>{pctText(p)}</span>);

/** Compte produit : évolution du prix payé (fiches de réception) */
export function ProductPriceEvolution({ points }: { points: PricePoint[] }) {
  const { t, locale } = useI18n();
  const P = t.priceEvolution;
  const [period, setPeriod] = useState<Period>(6);
  const shown = useMemo(() => points.filter((p) => day(p.date) >= since(period)).sort((a, b) => a.date.localeCompare(b.date)), [points, period]);
  const money = (v: number) => fmtMoney(v, locale);
  const vals = shown.map((p) => p.price);
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{P.title}</h2>
        <Periods value={period} onChange={setPeriod} options={[1, 3, 6, 12]} />
      </div>
      {shown.length === 0 ? <p className="text-sm text-stone-500">{P.none}</p> : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi label={P.last} value={money(vals[vals.length - 1])} />
            <Kpi label={P.change} value={shown.length > 1 ? pctText(((vals[vals.length - 1] - vals[0]) / vals[0]) * 100) : "—"} cls={vals[vals.length - 1] > vals[0] ? "text-red-700" : vals[vals.length - 1] < vals[0] ? "text-emerald-700" : ""} />
            <Kpi label={P.minMax} value={`${money(Math.min(...vals))} · ${money(Math.max(...vals))}`} />
            <Kpi label={P.average} value={money(Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100)} />
          </div>
          {shown.length > 1 ? <LineChart points={shown.map((p) => ({ date: day(p.date), value: p.price, href: p.href }))} color="#047857" format={money} /> : <p className="text-sm text-stone-500">{P.onePoint}</p>}
          <p className="mt-1 text-xs text-stone-500">{P.hint}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">{P.detail} ({shown.length})</summary>
            <table className="table mt-2 text-sm">
              <thead><tr><th>{t.common.date}</th><th className="text-right">{P.price}</th><th className="text-right">{P.variation}</th></tr></thead>
              <tbody>
                {[...shown].reverse().map((p, i, arr) => (
                  <tr key={i}>
                    <td>{p.href ? <Link href={p.href} className="text-brand-700 hover:underline">{ddmmyy(day(p.date))}</Link> : ddmmyy(day(p.date))}</td>
                    <td className="text-right tabular-nums">{money(p.price)}</td>
                    <td className="text-right">{i < arr.length - 1 ? <Tag p={((p.price - arr[i + 1].price) / arr[i + 1].price) * 100} /> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

export type SupplierPriceRow = { productId: number; name: string; date: string; price: number };

/** Compte fournisseur : indice des prix (base 100) et plus fortes variations par produit */
export function SupplierPriceEvolution({ rows }: { rows: SupplierPriceRow[] }) {
  const { t, locale } = useI18n();
  const P = t.priceEvolution;
  const [period, setPeriod] = useState<Period>(6);
  const money = (v: number) => fmtMoney(v, locale);
  const data = useMemo(() => {
    const from = since(period);
    const byProduct = new Map<number, { name: string; pts: { date: string; price: number }[] }>();
    for (const r of rows) {
      if (day(r.date) < from) continue;
      const e = byProduct.get(r.productId) ?? { name: r.name, pts: [] };
      e.pts.push({ date: day(r.date), price: r.price });
      byProduct.set(r.productId, e);
    }
    for (const e of byProduct.values()) e.pts.sort((a, b) => a.date.localeCompare(b.date));
    // Indice chaîné : chaque mois, variation moyenne des produits achetés ce mois-ci et le précédent
    const monthly = new Map<number, Map<string, number[]>>();
    for (const [id, e] of byProduct) {
      const m = new Map<string, number[]>();
      for (const p of e.pts) m.set(p.date.slice(0, 7), [...(m.get(p.date.slice(0, 7)) ?? []), p.price]);
      monthly.set(id, m);
    }
    const months = [...new Set([...monthly.values()].flatMap((m) => [...m.keys()]))].sort();
    const avg = (l: number[]) => l.reduce((s, v) => s + v, 0) / l.length;
    const index: { month: string; value: number }[] = [];
    months.forEach((m, i) => {
      if (i === 0) return void index.push({ month: m, value: 100 });
      const prev = months[i - 1];
      const ratios = [...monthly.values()].filter((x) => x.get(m) && x.get(prev)).map((x) => avg(x.get(m)!) / avg(x.get(prev)!));
      index.push({ month: m, value: index[i - 1].value * (ratios.length ? avg(ratios) : 1) });
    });
    const variations = [...byProduct.entries()]
      .filter(([, e]) => e.pts.length >= 2)
      .map(([id, e]) => ({ id, name: e.name, first: e.pts[0].price, last: e.pts[e.pts.length - 1].price, pct: ((e.pts[e.pts.length - 1].price - e.pts[0].price) / e.pts[0].price) * 100, pts: e.pts }))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return { index, variations, products: byProduct.size };
  }, [rows, period]);
  const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", { month: "short" });
  const lastIdx = data.index[data.index.length - 1]?.value ?? 100;
  const ups = data.variations.filter((v) => v.pct > 0.05).length;
  const downs = data.variations.filter((v) => v.pct < -0.05).length;
  const spark = (pts: { price: number }[], color: string) => {
    const W = 96, H = 26, ps = pts.map((p) => p.price), lo = Math.min(...ps), hi = Math.max(...ps) > lo ? Math.max(...ps) : lo + 1;
    return <svg width={W} height={H}><polyline points={ps.map((p, i) => `${(i / (ps.length - 1)) * (W - 4) + 2},${((hi - p) / (hi - lo)) * (H - 6) + 3}`).join(" ")} fill="none" stroke={color} strokeWidth={2} /></svg>;
  };
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{P.supplierTitle}</h2>
        <Periods value={period} onChange={setPeriod} options={[3, 6, 12]} />
      </div>
      {data.products === 0 ? <p className="text-sm text-stone-500">{P.none}</p> : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi label={`${P.index} (${P.base} ${data.index[0] ? monthLabel(data.index[0].month) : ""})`} value={`${lastIdx.toFixed(0)} (${pctText(lastIdx - 100)})`} cls={lastIdx > 100.05 ? "text-red-700" : lastIdx < 99.95 ? "text-emerald-700" : ""} />
            <Kpi label={P.ups} value={String(ups)} cls="text-red-700" />
            <Kpi label={P.downs} value={String(downs)} cls="text-emerald-700" />
            <Kpi label={P.tracked} value={String(data.variations.length)} />
          </div>
          {data.index.length > 1 && <LineChart points={data.index.map((x) => ({ date: `${x.month}-15`, value: x.value, label: monthLabel(x.month) }))} color="#7c3aed" format={(v) => v.toFixed(0)} base={100} />}
          <p className="mt-1 text-xs text-stone-500">{P.indexHint}</p>
          {data.variations.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-1 text-sm font-semibold">{P.topVariations}</p>
              <table className="table text-sm">
                <thead><tr><th>{t.common.product}</th><th className="text-right">{P.first}</th><th className="text-right">{P.last}</th><th className="text-right">{P.change}</th><th>{P.trend}</th></tr></thead>
                <tbody>
                  {data.variations.slice(0, 10).map((v) => (
                    <tr key={v.id}>
                      <td><Link href={`/mercurial/produits/${v.id}`} className="text-brand-700 hover:underline">{v.name}</Link></td>
                      <td className="text-right tabular-nums">{money(v.first)}</td>
                      <td className="text-right tabular-nums">{money(v.last)}</td>
                      <td className="text-right"><Tag p={v.pct} /></td>
                      <td>{spark(v.pts, v.pct > 0 ? "#b91c1c" : "#047857")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
