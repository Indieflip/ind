"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addMercurialRowAction, addUnitAction, deleteUnitAction, renameUnitAction, setProductActiveAction, updateMercurialRowAction,
} from "@/lib/actions/mercurial";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { UnitSelect } from "@/components/UnitSelect";

interface Opt { id: number; name: string }
interface Row {
  id: number; supplierId: number; supplier: string; service: string | null; nature: string | null;
  name: string; unit: string; priceMin: number | null; price: number | null; active: boolean;
}

export function AddRow({ suppliers, units, services, natures }: { suppliers: Opt[]; units: string[]; services: string[]; natures: string[] }) {
  const { t } = useI18n();
  const m = t.mercurial;
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
      <h2 className="font-semibold">{m.addRow}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className="label">{t.common.supplier} *</span>
          <select name="supplierId" className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="" />
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="new">+ {m.newSupplier}</option>
          </select>
        </label>
        <label><span className="label">{m.service}</span><input name="service" className="input" list="services-list" /></label>
        <label><span className="label">{m.nature}</span><input name="nature" className="input" list="natures-list" /></label>
        <label><span className="label">{m.products} *</span><input name="name" className="input" required /></label>
        <label><span className="label">{t.common.unit} *</span><UnitSelect name="unit" value={unit} units={units} onChange={setUnit} required /></label>
        <label><span className="label" title={m.minusTitle}>{m.minus}</span><input name="priceMin" className="input" inputMode="decimal" /></label>
        <label><span className="label" title={m.plusTitle}>{m.plus}</span><input name="price" className="input" inputMode="decimal" /></label>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button></div>
      </div>
      <datalist id="services-list">{services.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="natures-list">{natures.map((x) => <option key={x} value={x} />)}</datalist>
      {supplierId === "new" && <input name="newSupplier" className="input max-w-sm" placeholder={m.newSupplierName} required />}
      {state?.error && <p className="text-sm text-red-600">{state.error === "exists" ? m.exists : t.common.error}</p>}
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
      <ul className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
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

function Th({ label, col, sort, dir, params, align, title }: { label: string; col: string; sort?: string; dir: string; params: Record<string, string | undefined>; align?: "right"; title?: string }) {
  const { t } = useI18n();
  const on = sort === col;
  const next = on && dir === "asc" ? "desc" : "asc";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  q.set("sort", col);
  q.set("dir", next);
  return (
    <th className={align === "right" ? "text-right" : ""} title={title}>
      <Link href={`/mercurial?${q}`} className="inline-flex items-center gap-1 hover:text-stone-900" title={next === "asc" ? t.receptions.sortAsc : t.receptions.sortDesc}>
        {label}
        <span className={`text-[10px] ${on ? "text-brand-600" : "text-stone-300"}`}>{on ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </Link>
    </th>
  );
}

export function MercurialTable({ rows, suppliers, units, editable, sort, dir, params }: {
  rows: Row[]; suppliers: Opt[]; units: string[]; editable: boolean; sort?: string; dir: string; params: Record<string, string | undefined>;
}) {
  const { t } = useI18n();
  const m = t.mercurial;
  const h = { sort, dir, params };
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <Th label={t.common.supplier} col="supplier" {...h} />
            <Th label={m.service} col="service" {...h} />
            <Th label={m.nature} col="nature" {...h} />
            <Th label={m.products} col="name" {...h} />
            <Th label={t.common.unit} col="unit" {...h} />
            <Th label={m.minus} col="priceMin" align="right" title={m.minusTitle} {...h} />
            <Th label={m.plus} col="price" align="right" title={m.plusTitle} {...h} />
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <MercurialRow key={r.id} r={r} suppliers={suppliers} units={units} editable={editable} />)}
        </tbody>
      </table>
    </div>
  );
}

function MercurialRow({ r, suppliers, units, editable }: { r: Row; suppliers: Opt[]; units: string[]; editable: boolean }) {
  const { t, locale } = useI18n();
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [unit, setUnit] = useState(r.unit);
  const save = (data: Parameters<typeof updateMercurialRowAction>[1]) => start(() => updateMercurialRowAction(r.id, data));
  const str = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");

  if (!edit) {
    return (
      <tr className={r.active ? "" : "opacity-50"}>
        <td className="whitespace-nowrap text-stone-600">{r.supplier}</td>
        <td className="text-stone-600">{r.service ?? ""}</td>
        <td className="text-stone-600">{r.nature ?? ""}</td>
        <td className="font-medium">{r.name}</td>
        <td>{r.unit}</td>
        <td className="whitespace-nowrap text-right tabular-nums text-stone-500">{r.priceMin != null ? fmtMoney(r.priceMin, locale) : ""}</td>
        <td className="whitespace-nowrap text-right font-medium tabular-nums">{r.price != null ? fmtMoney(r.price, locale) : ""}</td>
        {editable && (
          <td className="text-right">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEdit(true)}><Icon name="edit" className="h-3.5 w-3.5" /> {t.common.edit}</button>
          </td>
        )}
      </tr>
    );
  }
  return (
    <tr className="bg-brand-50/40">
      <td className="min-w-40">
        <select className="input py-1.5" defaultValue={r.supplierId} onChange={(e) => save({ supplierId: Number(e.target.value) })}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td className="min-w-28"><input className="input py-1.5" list="services-list" defaultValue={r.service ?? ""} onBlur={(e) => e.target.value !== (r.service ?? "") && save({ service: e.target.value })} /></td>
      <td className="min-w-28"><input className="input py-1.5" list="natures-list" defaultValue={r.nature ?? ""} onBlur={(e) => e.target.value !== (r.nature ?? "") && save({ nature: e.target.value })} /></td>
      <td className="min-w-56"><input className="input py-1.5 font-medium" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && save({ name: e.target.value })} /></td>
      <td className="min-w-24"><UnitSelect className="input py-1.5" value={unit} units={units} onChange={(u) => { setUnit(u); save({ unit: u }); }} /></td>
      <td className="min-w-24"><input className="input py-1.5 text-right" inputMode="decimal" defaultValue={str(r.priceMin)} onBlur={(e) => e.target.value !== str(r.priceMin) && save({ priceMin: e.target.value })} /></td>
      <td className="min-w-24"><input className="input py-1.5 text-right" inputMode="decimal" defaultValue={str(r.price)} onBlur={(e) => e.target.value !== str(r.price) && save({ price: e.target.value })} /></td>
      <td className="whitespace-nowrap text-right">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs text-red-600"
          disabled={pending}
          onClick={() => { if (!r.active || confirm(t.suppliers.deleteWarning)) start(() => setProductActiveAction(r.id, !r.active)); }}
        >
          {r.active ? t.suppliers.deactivate : t.suppliers.reactivate}
        </button>
        <button className="btn-secondary px-2 py-1" onClick={() => setEdit(false)} aria-label={t.common.close}><Icon name="check" className="h-4 w-4" /></button>
      </td>
    </tr>
  );
}
