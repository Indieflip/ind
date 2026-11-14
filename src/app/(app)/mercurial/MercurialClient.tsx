"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addMercurialRowAction, addUnitAction, deleteUnitAction, renameUnitAction, setProductActiveAction, updateMercurialRowAction,
} from "@/lib/actions/mercurial";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { UnitSelect } from "@/components/UnitSelect";

interface Opt { id: number; name: string }
interface Row { id: number; supplierId: number; supplierName: string; name: string; unit: string; price: number | null; categoryId: number | null; active: boolean }

export function AddRow({ suppliers, units, categories }: { suppliers: Opt[]; units: string[]; categories: Opt[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addMercurialRowAction, undefined);
  const [supplierId, setSupplierId] = useState("");
  const [unit, setUnit] = useState(units[0] ?? "kg");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      const keep = supplierId; // on garde le fournisseur pour enchaîner les saisies
      ref.current?.reset();
      setSupplierId(keep === "new" ? "" : keep);
      (ref.current?.querySelector('input[name="name"]') as HTMLInputElement | null)?.focus();
    }
  }, [state, supplierId]);
  return (
    <form ref={ref} action={action} className="card space-y-3 p-4">
      <h2 className="font-semibold">{t.mercurial.addRow}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.6fr_1fr_0.9fr_1.2fr_auto] lg:items-end">
        <label>
          <span className="label">{t.common.supplier} *</span>
          <select name="supplierId" className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="" />
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="new">+ {t.mercurial.newSupplier}</option>
          </select>
        </label>
        <label><span className="label">{t.common.product} *</span><input name="name" className="input" required /></label>
        <label><span className="label">{t.common.unit} *</span><UnitSelect name="unit" value={unit} units={units} onChange={setUnit} required /></label>
        <label><span className="label">{t.mercurial.priceHt}</span><input name="price" className="input" inputMode="decimal" /></label>
        <label>
          <span className="label">{t.common.category}</span>
          <select name="categoryId" className="input" defaultValue="">
            <option value="" />
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button>
      </div>
      {supplierId === "new" && <input name="newSupplier" className="input max-w-sm" placeholder={t.mercurial.newSupplierName} required />}
      {state?.error && <p className="text-sm text-red-600">{state.error === "exists" ? t.mercurial.exists : t.common.error}</p>}
    </form>
  );
}

export function UnitsPanel({ units }: { units: Opt[] }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">{t.mercurial.units}</h2>
        <p className="text-xs text-stone-500">{t.mercurial.unitsHint}</p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {units.map((u) => (
          <li key={u.id} className="flex items-center gap-1 rounded-full border border-stone-300 bg-white py-0.5 pl-3 pr-1 text-sm">
            <input
              className="w-20 bg-transparent outline-none"
              defaultValue={u.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== u.name && start(() => renameUnitAction(u.id, e.target.value))}
            />
            <button
              type="button"
              className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
              aria-label={t.common.delete}
              onClick={() => start(async () => {
                const r = await deleteUnitAction(u.id);
                setError(r.error ? t.mercurial.unitUsed : "");
              })}
            >
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="input py-2" value={name} placeholder={t.mercurial.addUnit} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn-secondary py-2" disabled={!name.trim() || pending} onClick={() => start(async () => { await addUnitAction(name); setName(""); })}>
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function MercurialTable({ rows, suppliers, units, categories, editable }: { rows: Row[]; suppliers: Opt[]; units: string[]; categories: Opt[]; editable: boolean }) {
  const { t, locale } = useI18n();
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>{t.common.supplier}</th>
            <th>{t.common.product}</th>
            <th>{t.common.unit}</th>
            <th className="text-right">{t.mercurial.priceHt}</th>
            <th>{t.common.category}</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            editable ? (
              <EditableRow key={r.id} r={r} suppliers={suppliers} units={units} categories={categories} />
            ) : (
              <tr key={r.id}>
                <td className="text-stone-600">{r.supplierName}</td>
                <td className="font-medium">{r.name}</td>
                <td>{r.unit}</td>
                <td className="text-right tabular-nums">{fmtMoney(r.price, locale)}</td>
                <td className="text-stone-500">{categories.find((c) => c.id === r.categoryId)?.name ?? "—"}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditableRow({ r, suppliers, units, categories }: { r: Row; suppliers: Opt[]; units: string[]; categories: Opt[] }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [unit, setUnit] = useState(r.unit);
  const [saved, setSaved] = useState(false);
  const save = (data: Parameters<typeof updateMercurialRowAction>[1]) =>
    start(async () => {
      await updateMercurialRowAction(r.id, data);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  const priceStr = r.price != null ? String(r.price).replace(".", ",") : "";
  return (
    <tr className={r.active ? "" : "opacity-50"}>
      <td className="min-w-40">
        <select className="input py-1.5" defaultValue={r.supplierId} onChange={(e) => save({ supplierId: Number(e.target.value) })}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td className="min-w-48"><input className="input py-1.5 font-medium" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && save({ name: e.target.value })} /></td>
      <td className="min-w-28">
        <UnitSelect className="input py-1.5" value={unit} units={units} onChange={(u) => { setUnit(u); save({ unit: u }); }} />
      </td>
      <td className="min-w-28">
        <input className="input py-1.5 text-right tabular-nums" inputMode="decimal" defaultValue={priceStr} onBlur={(e) => e.target.value !== priceStr && save({ price: e.target.value })} />
      </td>
      <td className="min-w-40">
        <select className="input py-1.5" defaultValue={r.categoryId ?? ""} onChange={(e) => save({ categoryId: Number(e.target.value) || null })}>
          <option value="" />
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td className="whitespace-nowrap text-right">
        {saved && <Icon name="check" className="mr-1 inline h-4 w-4 text-emerald-600" />}
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs text-red-600"
          disabled={pending}
          onClick={() => { if (!r.active || confirm(t.suppliers.deleteWarning)) start(() => setProductActiveAction(r.id, !r.active)); }}
        >
          {r.active ? t.suppliers.deactivate : t.suppliers.reactivate}
        </button>
      </td>
    </tr>
  );
}
