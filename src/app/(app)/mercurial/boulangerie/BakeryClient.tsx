"use client";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addBakeryRowAction, deleteBakeryRowAction, setBakeryPriceAction, setBakeryRemarkAction, setBakerySupplierAction } from "@/lib/actions/bakery";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { Icon } from "@/components/Icon";

const ITEMS = ["baguette", "hamburger", "rolls", "painDeMie"] as const;
type Item = (typeof ITEMS)[number];

/** Produits boulangerie présentés comme le mercurial : Fournisseur | Produits | Unité | Prix */
export function BakeryProducts({ prices, supplier, suppliers, editable }: { prices: Record<string, number | null>; supplier: string; suppliers: string[]; editable: boolean }) {
  const { t, locale } = useI18n();
  const [, start] = useTransition();
  const str = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");
  return (
    <div className="card mb-4 overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>{t.common.supplier}</th><th>{t.mercurial.products}</th><th>{t.common.unit}</th><th className="text-right">{t.mercurial.priceHt}</th></tr>
        </thead>
        <tbody>
          {ITEMS.map((k, i) => (
            <tr key={k}>
              <td className="text-stone-600">
                {i === 0 && editable ? (
                  <select className="input py-1.5" defaultValue={supplier} title={t.bakery.supplierSetting} onChange={(e) => start(() => setBakerySupplierAction(e.target.value))}>
                    {!suppliers.includes(supplier) && <option value={supplier}>{supplier}</option>}
                    {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  supplier
                )}
              </td>
              <td className="font-medium">{t.bakery[k]}</td>
              <td>Pièce</td>
              <td className="text-right">
                {editable ? (
                  <input
                    className="input ml-auto w-28 py-1.5 text-right"
                    inputMode="decimal"
                    defaultValue={str(prices[k])}
                    onBlur={(e) => e.target.value !== str(prices[k]) && start(() => setBakeryPriceAction(k, e.target.value))}
                  />
                ) : (
                  <span className="tabular-nums">{fmtMoney(prices[k], locale)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AddBakeryRow() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addBakeryRowAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="card mb-4 grid gap-2 p-4 sm:grid-cols-[1.2fr_repeat(4,1fr)_1.5fr_auto] sm:items-end">
      <label><span className="label">{t.bakery.date}</span><input type="date" name="date" className="input" required /></label>
      {ITEMS.map((k) => (
        <label key={k}><span className="label">{t.bakery[k]}</span><input name={k} className="input" inputMode="decimal" /></label>
      ))}
      <label><span className="label">{t.bakery.remark}</span><input name="remark" className="input" /></label>
      <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.bakery.add}</button>
    </form>
  );
}

interface Row { id: number; date: string; receptionId: number | null; remark: string | null; baguette: number | null; hamburger: number | null; rolls: number | null; painDeMie: number | null }

/** Tableau des livraisons : en-tête fixe, filtre par mois, sélection de lignes avec total */
export function BakeryTable({ rows, prices, editable }: { rows: Row[]; prices: Record<string, number | null>; editable: boolean }) {
  const { t, locale } = useI18n();
  const b = t.bakery;
  const months = useMemo(() => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(), [rows]);
  const [month, setMonth] = useState(months[0] ?? "");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const shown = useMemo(() => rows.filter((r) => !month || r.date.startsWith(month)).sort((a, b2) => b2.date.localeCompare(a.date)), [rows, month]);
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(m + "-15"));

  const totals = (list: Row[]) => {
    const q = Object.fromEntries(ITEMS.map((k) => [k, list.reduce((s, r) => s + (r[k] ?? 0), 0)])) as Record<Item, number>;
    const amount = ITEMS.reduce((s, k) => s + q[k] * (prices[k] ?? 0), 0);
    return { q, amount };
  };
  const all = totals(shown);
  const selected = shown.filter((r) => sel.has(r.id));
  const selT = totals(selected);
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allChecked = shown.length > 0 && shown.every((r) => sel.has(r.id));

  const totalRow = (label: string, tt: ReturnType<typeof totals>, cls: string) => (
    <tr className={cls}>
      <td />
      <td className="font-semibold">{label}</td>
      {ITEMS.map((k) => <td key={k} className="text-right font-semibold tabular-nums">{fmtNum(tt.q[k], locale)}</td>)}
      <td colSpan={editable ? 3 : 2} className="text-right font-semibold tabular-nums">{tt.amount > 0 ? `${fmtMoney(tt.amount, locale)} HT` : ""}</td>
    </tr>
  );

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <select className="input w-56 py-2 capitalize" value={month} onChange={(e) => { setMonth(e.target.value); setSel(new Set()); }}>
          <option value="">{b.allMonths}</option>
          {months.map((m) => <option key={m} value={m} className="capitalize">{monthLabel(m)}</option>)}
        </select>
        {selected.length > 0 && (
          <span className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <strong>{selected.length}</strong> {b.selectedRows} · {ITEMS.map((k) => `${b[k]} ${fmtNum(selT.q[k], locale)}`).join(" · ")}
            {selT.amount > 0 && <> · <strong>{fmtMoney(selT.amount, locale)} HT</strong></>}
            <button className="ml-2 underline" onClick={() => setSel(new Set())}>{t.consolidation.selectNone}</button>
          </span>
        )}
      </div>
      <div className="card max-h-[75vh] overflow-auto">
        <table className="table">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-8"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} aria-label={t.consolidation.selectAll} /></th>
              <th>{b.date}</th>
              {ITEMS.map((k) => <th key={k} className="text-right">{b[k]}</th>)}
              <th className="min-w-48">{b.remark}</th>
              <th>{b.bl}</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={sel.has(r.id) ? "bg-brand-50/60" : ""}>
                <td><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="whitespace-nowrap">{fmtDate(r.date, locale)}</td>
                {ITEMS.map((k) => <td key={k} className="text-right tabular-nums">{r[k] != null ? fmtNum(r[k], locale) : ""}</td>)}
                <td>{editable ? <Remark id={r.id} initial={r.remark ?? ""} /> : r.remark}</td>
                <td>{r.receptionId ? <Link className="text-brand-700 hover:underline" href={`/receptions/${r.receptionId}`}>→</Link> : <span className="text-xs text-stone-400">{b.manual}</span>}</td>
                {editable && <td className="text-right">{!r.receptionId && <DeleteBakeryRow id={r.id} />}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-stone-50">
            {selected.length > 0 && totalRow(`${b.total} (${selected.length} ${b.selectedRows})`, selT, "bg-brand-50")}
            {totalRow(`${b.total} ${month ? monthLabel(month) : ""}`, all, "bg-stone-50")}
          </tfoot>
        </table>
      </div>
    </>
  );
}

function Remark({ id, initial }: { id: number; initial: string }) {
  const [v, setV] = useState(initial);
  const [, start] = useTransition();
  return <input className="input px-2 py-1 text-sm" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== initial && start(() => setBakeryRemarkAction(id, v))} />;
}

export function DeleteBakeryRow({ id }: { id: number }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost p-1 text-stone-400 hover:text-red-600" disabled={pending} aria-label={t.common.delete} onClick={() => confirm(t.common.confirmDelete) && start(() => deleteBakeryRowAction(id))}>
      <Icon name="trash" className="h-4 w-4" />
    </button>
  );
}
