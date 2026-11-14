"use client";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { addBakeryRowAction, deleteBakeryRowAction, setBakeryPriceAction, setBakerySupplierAction } from "@/lib/actions/bakery";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

const ITEMS = ["baguette", "hamburger", "rolls", "painDeMie"] as const;

export function BakeryPrices({ prices, supplier, suppliers, editable }: { prices: Record<string, number | null>; supplier: string; suppliers: string[]; editable: boolean }) {
  const { t } = useI18n();
  const [, start] = useTransition();
  const str = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");
  return (
    <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="lg:col-span-1">
        <span className="label">{t.bakery.supplierSetting}</span>
        {editable ? (
          <select className="input" defaultValue={supplier} onChange={(e) => start(() => setBakerySupplierAction(e.target.value))}>
            {!suppliers.includes(supplier) && <option value={supplier}>{supplier}</option>}
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <p className="py-2 font-medium">{supplier}</p>
        )}
      </label>
      {ITEMS.map((k) => (
        <label key={k}>
          <span className="label">PU {t.bakery[k]} (€ HT)</span>
          <input
            className="input"
            inputMode="decimal"
            defaultValue={str(prices[k])}
            disabled={!editable}
            onBlur={(e) => e.target.value !== str(prices[k]) && start(() => setBakeryPriceAction(k, e.target.value))}
          />
        </label>
      ))}
    </div>
  );
}

export function AddBakeryRow() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addBakeryRowAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="card mb-4 grid gap-2 p-4 sm:grid-cols-[1.2fr_repeat(4,1fr)_auto] sm:items-end">
      <label><span className="label">{t.bakery.date}</span><input type="date" name="date" className="input" required /></label>
      {ITEMS.map((k) => (
        <label key={k}><span className="label">{t.bakery[k]}</span><input name={k} className="input" inputMode="decimal" /></label>
      ))}
      <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.bakery.add}</button>
    </form>
  );
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
