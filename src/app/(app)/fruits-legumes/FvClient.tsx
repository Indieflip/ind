"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addFvAction, deleteFvAction, updateFvAction } from "@/lib/actions/fv";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

interface Row { id: number; supplier: string; product: string; unit: string | null; prices: (number | null)[]; blocked: string | null; locked: boolean }

const cell = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2).replace(".", ","));

export function FvTable({ rows, months, currentMonth, editable }: { rows: Row[]; months: string[]; currentMonth: number; editable: boolean }) {
  const { t } = useI18n();
  return (
    <div className="card max-h-[75vh] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-stone-50">
          <tr>
            <th rowSpan={2} className="border-b border-stone-200 bg-stone-50 px-2 py-2 font-semibold">{t.fv.supplier}</th>
            <th rowSpan={2} className="sticky left-0 z-20 min-w-56 border-b border-stone-200 bg-stone-50 px-2 py-2 font-semibold">{t.common.product}</th>
            <th rowSpan={2} className="border-b border-stone-200 px-2 py-2 font-semibold">{t.common.unit}</th>
            {months.map((m, i) => (
              <th key={m} colSpan={2} className={`border-b border-l border-stone-200 px-2 py-1 text-center font-semibold capitalize ${i === currentMonth ? "bg-brand-50 text-brand-700" : ""}`}>{m}</th>
            ))}
            <th rowSpan={2} className="border-b border-l border-stone-200 px-2 py-2 font-semibold">{t.fv.blocked}</th>
            {editable && <th rowSpan={2} className="border-b border-stone-200" />}
          </tr>
          <tr>
            {months.map((m, i) => (
              <FragmentPair key={m} highlight={i === currentMonth} minus={t.fv.minus} plus={t.fv.plus} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <FvRow key={r.id} r={r} currentMonth={currentMonth} editable={editable} />)}
        </tbody>
      </table>
    </div>
  );
}

function FragmentPair({ highlight, minus, plus }: { highlight: boolean; minus: string; plus: string }) {
  const cls = `border-b border-stone-200 px-2 py-1 text-right font-medium text-stone-500 ${highlight ? "bg-brand-50" : ""}`;
  return (
    <>
      <th className={`${cls} border-l`}>{minus}</th>
      <th className={cls}>{plus}</th>
    </>
  );
}

function FvRow({ r, currentMonth, editable }: { r: Row; currentMonth: number; editable: boolean }) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [prices, setPrices] = useState<string[]>(() => Array.from({ length: 24 }, (_, i) => cell(r.prices[i])));
  const td = "border-b border-stone-100 px-2 py-1.5";
  if (!edit) {
    return (
      <tr className={r.locked ? "bg-sky-50 hover:bg-sky-100" : "hover:bg-stone-50"} title={r.locked ? t.fv.lockedHint : undefined}>
        <td className={`${td} whitespace-nowrap text-stone-500`}>{r.supplier}</td>
        <td className={`${td} sticky left-0 font-medium ${r.locked ? "bg-sky-50 text-sky-900" : "bg-white"}`}>{r.locked && "🔒 "}{r.product}</td>
        <td className={td}>{r.unit}</td>
        {Array.from({ length: 24 }, (_, i) => (
          <td key={i} className={`${td} text-right tabular-nums ${i % 2 === 0 ? "border-l border-stone-100 text-stone-500" : ""} ${Math.floor(i / 2) === currentMonth ? "bg-brand-50/60" : ""}`}>{cell(r.prices[i])}</td>
        ))}
        <td className={`${td} border-l`}>{r.blocked}</td>
        {editable && (
          <td className={td}>
            <button className="btn-ghost px-1.5 py-1" onClick={() => setEdit(true)} aria-label={t.common.edit}><Icon name="edit" className="h-3.5 w-3.5" /></button>
          </td>
        )}
      </tr>
    );
  }
  return (
    <tr className="bg-brand-50/40">
      <td className={td}><input className="input w-24 px-1.5 py-1 text-xs" defaultValue={r.supplier} onBlur={(e) => e.target.value !== r.supplier && start(() => updateFvAction(r.id, { supplier: e.target.value }))} /></td>
      <td className={`${td} sticky left-0 bg-brand-50`}>
        <input className="input px-1.5 py-1 text-xs" defaultValue={r.product} onBlur={(e) => e.target.value !== r.product && start(() => updateFvAction(r.id, { product: e.target.value }))} />
        <label className="mt-1 flex items-center gap-1.5 text-xs" title={t.fv.lockedHint}>
          <input type="checkbox" defaultChecked={r.locked} className="h-3.5 w-3.5 accent-brand-600" onChange={(e) => start(() => updateFvAction(r.id, { locked: e.target.checked }))} /> 🔒 {t.fv.locked}
        </label>
      </td>
      <td className={td}><input className="input w-14 px-1.5 py-1 text-xs" defaultValue={r.unit ?? ""} onBlur={(e) => start(() => updateFvAction(r.id, { unit: e.target.value }))} /></td>
      {prices.map((p, i) => (
        <td key={i} className={`${td} ${i % 2 === 0 ? "border-l border-stone-100" : ""}`}>
          <input
            className="input w-16 px-1.5 py-1 text-right text-xs"
            inputMode="decimal"
            value={p}
            onChange={(e) => setPrices((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
            onBlur={() => start(() => updateFvAction(r.id, { prices }))}
          />
        </td>
      ))}
      <td className={`${td} border-l`}><input className="input w-24 px-1.5 py-1 text-xs" defaultValue={r.blocked ?? ""} onBlur={(e) => start(() => updateFvAction(r.id, { blocked: e.target.value }))} /></td>
      <td className={`${td} whitespace-nowrap`}>
        <button className="btn-ghost px-1.5 py-1 text-red-600" disabled={pending} onClick={() => confirm(t.common.confirmDelete) && start(() => deleteFvAction(r.id))} aria-label={t.common.delete}><Icon name="trash" className="h-3.5 w-3.5" /></button>
        <button className="btn-secondary px-1.5 py-1" onClick={() => setEdit(false)} aria-label={t.common.close}><Icon name="check" className="h-3.5 w-3.5" /></button>
      </td>
    </tr>
  );
}

export function AddFv({ year, suppliers }: { year: number; suppliers: string[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addFvAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="card mb-4 grid gap-2 p-4 sm:grid-cols-[1fr_2fr_0.7fr_auto_auto] sm:items-end">
      <input type="hidden" name="year" value={year} />
      <label><span className="label">{t.fv.supplier} *</span><input name="supplier" list="fv-suppliers" className="input" required /></label>
      <label><span className="label">{t.common.product} *</span><input name="product" className="input" required /></label>
      <label><span className="label">{t.common.unit}</span><input name="unit" className="input" defaultValue="Kg" /></label>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="locked" className="h-4 w-4 accent-brand-600" /> 🔒 {t.fv.locked}</label>
      <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button>
      <datalist id="fv-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
    </form>
  );
}
