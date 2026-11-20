"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

interface Row { supplierId: number | null; supplier: string; product: string; nature: string; period: string; amount: number }
type Agg = { key: string; supplierId: number | null; supplier: string; product: string; nature: string; cells: Record<string, number>; total: number };

/** Reporting > Achats par fournisseur : colonnes Produit et Nature produit à afficher ou masquer, filtres et tri en en-tête */
export function PurchasesTable({ rows, periods, freq, freqs }: { rows: Row[]; periods: { key: string; label: string }[]; freq: string; freqs: string[] }) {
  const { t, locale } = useI18n();
  const A = t.purchases;
  const [showProduct, setShowProduct] = useState(false);
  const [showNature, setShowNature] = useState(false);
  const money = (n: number) => fmtMoney(n, locale);

  // Une ligne par fournisseur, ou par fournisseur × produit / nature selon les colonnes affichées
  const data = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const key = [r.supplierId ?? r.supplier, showProduct ? r.product : "", showNature ? r.nature : ""].join("|");
      const a = m.get(key) ?? { key, supplierId: r.supplierId, supplier: r.supplier, product: showProduct ? r.product : "", nature: showNature ? r.nature : "", cells: {}, total: 0 };
      a.cells[r.period] = (a.cells[r.period] ?? 0) + r.amount;
      a.total += r.amount;
      m.set(key, a);
    }
    return [...m.values()];
  }, [rows, showProduct, showNature]);
  const grand = data.reduce((s, x) => s + x.total, 0);
  const colTotal = (p: string) => data.reduce((s, x) => s + (x.cells[p] ?? 0), 0);
  const max = Math.max(1, ...periods.map((p) => colTotal(p.key)));
  const top = [...data].sort((a, b) => b.total - a.total)[0];
  const suppliers = new Set(data.map((x) => x.supplier)).size;

  const cols: Col<Agg>[] = [
    {
      key: "supplier", label: t.common.supplier, text: (r) => r.supplier, keepCase: true,
      headerAction: (
        <span className="inline-flex">
          {!showProduct && <button type="button" className="ml-1.5 rounded border border-stone-300 px-1 text-[10px] font-normal text-stone-500 hover:border-brand-500 hover:text-brand-700" title={A.showColumn} onClick={() => setShowProduct(true)}>+ {t.common.product}</button>}
          {!showNature && <button type="button" className="ml-1.5 rounded border border-stone-300 px-1 text-[10px] font-normal text-stone-500 hover:border-brand-500 hover:text-brand-700" title={A.showColumn} onClick={() => setShowNature(true)}>+ {A.nature}</button>}
        </span>
      ),
      render: (r) => (r.supplierId ? <Link href={`/mercurial/fournisseurs/${r.supplierId}`} className="font-medium hover:text-brand-700 hover:underline">{r.supplier}</Link> : r.supplier) },
    ...(showProduct ? [{ key: "product", label: t.common.product, text: (r: Agg) => r.product, keepCase: true, headerAction: <button type="button" className="ml-1 text-xs text-stone-400 hover:text-red-600" title={A.hideColumn} onClick={() => setShowProduct(false)}>✕</button> } as Col<Agg>] : []),
    ...(showNature ? [{ key: "nature", label: A.nature, text: (r: Agg) => r.nature || "—", headerAction: <button type="button" className="ml-1 text-xs text-stone-400 hover:text-red-600" title={A.hideColumn} onClick={() => setShowNature(false)}>✕</button> } as Col<Agg>] : []),
    ...periods.map((p) => ({ key: `p${p.key}`, label: p.label, align: "right", className: "whitespace-nowrap tabular-nums", text: (r: Agg) => (r.cells[p.key] ? money(r.cells[p.key]) : ""), sort: (r: Agg) => r.cells[p.key] ?? 0, render: (r: Agg) => (r.cells[p.key] ? money(r.cells[p.key]) : <span className="text-stone-300">—</span>) }) as Col<Agg>),
    { key: "total", label: A.total, align: "right", className: "whitespace-nowrap font-semibold tabular-nums", text: (r) => money(r.total), sort: (r) => r.total },
    { key: "share", label: "%", align: "right", className: "tabular-nums text-stone-500", text: (r) => `${grand ? Math.round((r.total / grand) * 100) : 0} %`, sort: (r) => r.total },
  ];

  return (
    <section id="achats" className="scroll-mt-4">
      <h2 className="text-lg font-bold">{A.title}</h2>
      <p className="mb-3 max-w-3xl text-sm text-stone-600">{A.intro}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-stone-600">{A.frequency} :</span>
        {freqs.map((f) => (
          <Link key={f} scroll={false} href={`/reporting?af=${f}#achats`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${f === freq ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}>{A.freqs[f as "mois"]}</Link>
        ))}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wider text-stone-500">{A.total}</p><p className="text-2xl font-bold tabular-nums">{money(grand)}</p><p className="text-xs text-stone-500">{periods[0]?.label} → {periods[periods.length - 1]?.label}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wider text-stone-500">{A.suppliers}</p><p className="text-2xl font-bold tabular-nums">{suppliers}</p></div>
        <div className="card p-4"><p className="text-xs font-bold uppercase tracking-wider text-stone-500">{A.top}</p><p className="truncate text-2xl font-bold">{top ? [top.supplier, top.product, top.nature].filter(Boolean).join(" · ") : "—"}</p><p className="text-xs text-stone-500">{top && grand ? `${money(top.total)} · ${Math.round((top.total / grand) * 100)} %` : ""}</p></div>
      </div>

      <div className="card mb-3 p-4">
        <div className="flex h-28 items-end gap-1.5">
          {periods.map((p) => (
            <div key={p.key} className="flex h-full flex-1 flex-col justify-end" title={`${p.label} : ${money(colTotal(p.key))}`}>
              <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max(2, (colTotal(p.key) / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">{periods.map((p) => <span key={p.key} className="flex-1 truncate text-center text-[10px] text-stone-500">{p.label}</span>)}</div>
      </div>

      <DataTable rows={data} cols={cols} rowKey={(r) => r.key} dense defaultSort={{ key: "total", dir: "desc" }} empty={A.empty} />
      <p className="mt-2 text-xs text-stone-500">{A.note}</p>
    </section>
  );
}
