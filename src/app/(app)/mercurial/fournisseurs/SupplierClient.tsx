"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addProductAction, addSupplierAction, importCatalogAction, updateProductAction, updateSupplierAction } from "@/lib/actions/suppliers";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { UnitSelect } from "@/components/UnitSelect";

export function AddSupplier() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addSupplierAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} id="new" className="card space-y-2 p-4 target:ring-2 target:ring-brand-500">
      <h2 className="font-semibold">{t.suppliers.addSupplier}</h2>
      <div className="flex gap-2">
        <input name="name" className="input" placeholder={t.suppliers.supplierName} required />
        <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button>
      </div>
    </form>
  );
}

export function ImportCatalog() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(importCatalogAction, undefined);
  return (
    <form action={action} className="card space-y-2 p-4">
      <h2 className="font-semibold">{t.suppliers.import}</h2>
      <p className="text-xs text-stone-500">{t.suppliers.importHint}</p>
      <textarea name="text" rows={3} className="input font-mono text-xs" placeholder="Metro ; Saumon 5/6 ; kg ; Poissons ; 14,90" />
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".csv,.txt,text/csv" className="text-sm" />
        <button className="btn-secondary" disabled={pending}>{pending ? t.common.loading : t.suppliers.importButton}</button>
      </div>
      {state?.ok && <p className="text-sm text-emerald-700">{t.suppliers.importResult} : {state.message}</p>}
    </form>
  );
}

export function SupplierInfo({ id, name, email, phone, notes, active }: { id: number; name: string; email: string; phone: string; notes: string; active: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const save = (data: Parameters<typeof updateSupplierAction>[1]) => start(() => updateSupplierAction(id, data));
  return (
    <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label><span className="label">{t.suppliers.supplierName}</span><input className="input" defaultValue={name} onBlur={(e) => e.target.value !== name && save({ name: e.target.value })} /></label>
      <label><span className="label">{t.suppliers.email}</span><input className="input" type="email" defaultValue={email} onBlur={(e) => e.target.value !== email && save({ email: e.target.value })} /></label>
      <label><span className="label">{t.suppliers.phone}</span><input className="input" defaultValue={phone} onBlur={(e) => e.target.value !== phone && save({ phone: e.target.value })} /></label>
      <label><span className="label">{t.common.notes}</span><input className="input" defaultValue={notes} onBlur={(e) => e.target.value !== notes && save({ notes: e.target.value })} /></label>
      <div className="sm:col-span-2 lg:col-span-4">
        <button
          className={active ? "btn-ghost text-red-600" : "btn-secondary"}
          disabled={pending}
          onClick={() => { if (confirm(active ? t.suppliers.deleteWarning : `${t.suppliers.reactivate} ?`)) save({ active: !active }); }}
        >
          {active ? t.suppliers.deactivate : t.suppliers.reactivate}
        </button>
      </div>
    </div>
  );
}

interface Cat { id: number; name: string }

export function AddProduct({ supplierId, categories, units }: { supplierId: number; categories: Cat[]; units: string[] }) {
  const { t } = useI18n();
  const [unit, setUnit] = useState(units[0] ?? "Kg");
  const [state, action, pending] = useActionState(addProductAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="card grid gap-2 p-4 sm:grid-cols-[2fr_1fr_1.5fr_1fr_auto] sm:items-end">
      <input type="hidden" name="supplierId" value={supplierId} />
      <label><span className="label">{t.common.product} *</span><input name="name" className="input" required /></label>
      <label><span className="label">{t.common.unit} *</span><UnitSelect name="unit" value={unit} units={units} onChange={setUnit} required /></label>
      <label>
        <span className="label">{t.common.category} *</span>
        <select name="categoryId" className="input" required defaultValue="">
          <option value="" />
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label><span className="label">{t.common.price} HT</span><input name="price" className="input" inputMode="decimal" /></label>
      <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button>
    </form>
  );
}

export function ProductRow({
  p,
  editable,
}: {
  p: { id: number; name: string; unit: string; nature: string | null; priceMin: string | null; price: string | null; priceLocked: boolean; active: boolean };
  editable: boolean;
}) {
  const { t, locale } = useI18n();
  const m = t.mercurial;
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const lo = p.priceMin ?? p.price;
  const hi = p.price ?? p.priceMin;
  if (!editable || !edit) {
    return (
      <tr className={p.active ? "" : "opacity-50"}>
        <td className="font-medium">{p.name}{p.priceLocked && <span className="ml-1.5 badge bg-sky-100 text-sky-800">🔒 {m.locked}</span>}</td>
        <td>{p.unit}</td>
        <td className="text-stone-600">{p.nature ?? "—"}</td>
        <td className="text-right tabular-nums">{fmtMoney(p.priceMin, locale)}</td>
        <td className="text-right tabular-nums">{fmtMoney(p.price, locale)}</td>
        <td className="whitespace-nowrap text-right tabular-nums text-stone-600">{lo == null ? "—" : lo === hi ? fmtMoney(lo, locale) : `${fmtMoney(lo, locale)} – ${fmtMoney(hi, locale)}`}</td>
        <td className="text-right">
          {editable && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEdit(true)}>{t.common.edit}</button>}
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td><input className="input py-1.5" defaultValue={p.name} onBlur={(e) => start(() => updateProductAction(p.id, { name: e.target.value }))} /></td>
      <td><input className="input w-24 py-1.5" list="units-list" defaultValue={p.unit} onBlur={(e) => start(() => updateProductAction(p.id, { unit: e.target.value }))} /></td>
      <td className="text-stone-600">{p.nature ?? "—"}</td>
      <td className="text-right text-xs text-stone-500">{fmtMoney(p.priceMin, locale)}</td>
      <td className="text-right text-xs text-stone-500">{fmtMoney(p.price, locale)}</td>
      <td />
      <td className="whitespace-nowrap text-right">
        <button
          className="btn-ghost px-2 py-1 text-xs text-red-600"
          disabled={pending}
          onClick={() => { if (confirm(p.active ? t.suppliers.deleteWarning : `${t.suppliers.reactivate} ?`)) start(() => updateProductAction(p.id, { active: !p.active })); }}
        >
          {p.active ? t.suppliers.deactivate : t.suppliers.reactivate}
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEdit(false)}><Icon name="check" className="h-4 w-4" /></button>
      </td>
    </tr>
  );
}
