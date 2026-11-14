"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addMercurialRowAction, addUnitAction, deleteUnitAction, renameUnitAction, setProductActiveAction, updateMercurialRowAction,
} from "@/lib/actions/mercurial";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { matches } from "@/lib/search";
import { Icon } from "@/components/Icon";
import { UnitSelect } from "@/components/UnitSelect";
import { NatureSelect } from "@/components/NatureSelect";

interface Opt { id: number; name: string }
interface Row {
  id: number; supplierId: number; supplier: string; nature: string | null;
  name: string; unit: string; priceMin: number | null; price: number | null; priceLocked: boolean; active: boolean;
}

export function AddRow({ suppliers, units, natures }: { suppliers: Opt[]; units: string[]; natures: string[] }) {
  const { t } = useI18n();
  const m = t.mercurial;
  const router = useRouter();
  const [state, action, pending] = useActionState(addMercurialRowAction, undefined);
  const [supplierId, setSupplierId] = useState("");
  const [unit, setUnit] = useState(units[0] ?? "Kg");
  const [natureKey, setNatureKey] = useState(0);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      const keep = supplierId; // on garde le fournisseur pour enchaîner les saisies
      ref.current?.reset();
      setSupplierId(keep);
      setNatureKey((k) => k + 1);
      (ref.current?.querySelector('input[name="name"]') as HTMLInputElement | null)?.focus();
    }
  }, [state, supplierId]);
  return (
    <form ref={ref} action={action} className="card space-y-3 p-4">
      <h2 className="font-semibold">{m.addRow}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.6fr_1fr_0.8fr_0.8fr]">
        <label>
          <span className="label">{t.common.supplier} *</span>
          <select
            name="supplierId"
            className="input"
            value={supplierId}
            required
            onChange={(e) => {
              // « Rajout fournisseur » : création dans l'onglet Fournisseurs
              if (e.target.value === "new") router.push("/mercurial/fournisseurs#new");
              else setSupplierId(e.target.value);
            }}
          >
            <option value="" />
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="new">{m.addSupplierLink}</option>
          </select>
        </label>
        <label><span className="label">{m.products} *</span><input name="name" className="input" required /></label>
        <label><span className="label">{t.common.unit} *</span><UnitSelect name="unit" value={unit} units={units} onChange={setUnit} required /></label>
        <label><span className="label">{m.priceMin}</span><input name="priceMin" className="input" inputMode="decimal" /></label>
        <label><span className="label">{m.priceMax}</span><input name="price" className="input" inputMode="decimal" /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <div>
          <span className="label">{m.nature}</span>
          <NatureSelect key={natureKey} name="nature" value="" options={natures} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm" title={m.lockedHint}>
          <input type="checkbox" name="priceLocked" className="h-4 w-4 accent-brand-600" /> 🔒 {m.locked}
        </label>
        <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button>
      </div>
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
              onClick={() => {
                if (!confirm(`${t.mercurial.unitDeleteConfirm}\n${u.name}`)) return;
                start(async () => {
                  const r = await deleteUnitAction(u.id);
                  setError(r.error ? t.mercurial.unitUsed : "");
                });
              }}
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

function Th({ label, col, sort, dir, params, align }: { label: string; col: string; sort?: string; dir: string; params: Record<string, string | undefined>; align?: "right" }) {
  const { t } = useI18n();
  const on = sort === col;
  const next = on && dir === "asc" ? "desc" : "asc";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  q.set("sort", col);
  q.set("dir", next);
  return (
    <th className={align === "right" ? "text-right" : ""}>
      <Link href={`/mercurial?${q}`} className="inline-flex items-center gap-1 hover:text-stone-900" title={next === "asc" ? t.receptions.sortAsc : t.receptions.sortDesc}>
        {label}
        <span className={`text-[10px] ${on ? "text-brand-600" : "text-stone-300"}`}>{on ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </Link>
    </th>
  );
}

type FilterKey = "supplier" | "nature" | "name" | "unit" | "priceMin" | "price";

export function MercurialTable({ rows, suppliers, units, natures, editable, sort, dir, params }: {
  rows: Row[]; suppliers: Opt[]; units: string[]; natures: string[]; editable: boolean; sort?: string; dir: string; params: Record<string, string | undefined>;
}) {
  const { t, locale } = useI18n();
  const m = t.mercurial;
  const h = { sort, dir, params };
  // Filtres par colonne (en direct, accents et majuscules ignorés)
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ supplier: "", nature: "", name: "", unit: "", priceMin: "", price: "" });
  const shown = useMemo(() => {
    const val = (r: Row, k: FilterKey) =>
      k === "priceMin" ? (r.priceMin != null ? fmtMoney(r.priceMin, locale) : "") : k === "price" ? (r.price != null ? fmtMoney(r.price, locale) : "") : String(r[k] ?? "");
    return rows.filter((r) => (Object.keys(filters) as FilterKey[]).every((k) => !filters[k] || matches(val(r, k), filters[k])));
  }, [rows, filters, locale]);
  const filterInput = (k: FilterKey) => (
    <th className="bg-white py-1.5">
      <input
        className="input px-2 py-1 text-xs font-normal"
        placeholder={m.columnFilter}
        value={filters[k]}
        onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
      />
    </th>
  );
  return (
    <>
      {shown.length !== rows.length && <p className="mb-2 text-sm text-stone-500">{shown.length} / {rows.length} {m.count}</p>}
      <div className="card max-h-[75vh] overflow-auto">
        <table className="table">
          <thead className="sticky top-0 z-10">
            <tr>
              <Th label={t.common.supplier} col="supplier" {...h} />
              <Th label={m.nature} col="nature" {...h} />
              <Th label={m.products} col="name" {...h} />
              <Th label={t.common.unit} col="unit" {...h} />
              <Th label={m.priceMin} col="priceMin" align="right" {...h} />
              <Th label={m.priceMax} col="price" align="right" {...h} />
              {editable && <th />}
            </tr>
            <tr>
              {filterInput("supplier")}
              {filterInput("nature")}
              {filterInput("name")}
              {filterInput("unit")}
              {filterInput("priceMin")}
              {filterInput("price")}
              {editable && <th className="bg-white" />}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 600).map((r) => <MercurialRow key={r.id} r={r} suppliers={suppliers} units={units} natures={natures} editable={editable} />)}
          </tbody>
        </table>
        {shown.length > 600 && <p className="p-3 text-center text-xs text-stone-500">600 / {shown.length} — {m.columnFilter}</p>}
      </div>
    </>
  );
}

function MercurialRow({ r, suppliers, units, natures, editable }: { r: Row; suppliers: Opt[]; units: string[]; natures: string[]; editable: boolean }) {
  const { t, locale } = useI18n();
  const m = t.mercurial;
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const [unit, setUnit] = useState(r.unit);
  const save = (data: Parameters<typeof updateMercurialRowAction>[1]) => start(() => updateMercurialRowAction(r.id, data));
  const str = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");

  if (!edit) {
    return (
      <tr className={r.active ? "" : "opacity-50"}>
        <td className="whitespace-nowrap text-stone-600">{r.supplier}</td>
        <td className="text-stone-600">{r.nature ?? ""}</td>
        <td className="font-medium">{r.name}{r.priceLocked && <span className="ml-1.5 badge bg-sky-100 text-sky-800" title={m.lockedHint}>🔒 {m.locked}</span>}</td>
        <td>{r.unit}</td>
        <td className="whitespace-nowrap text-right tabular-nums">{r.priceMin != null ? fmtMoney(r.priceMin, locale) : ""}</td>
        <td className="whitespace-nowrap text-right tabular-nums">{r.price != null ? fmtMoney(r.price, locale) : ""}</td>
        {editable && (
          <td className="text-right">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEdit(true)}><Icon name="edit" className="h-3.5 w-3.5" /> {t.common.edit}</button>
          </td>
        )}
      </tr>
    );
  }
  return (
    <tr className="bg-brand-50/40 align-top">
      <td className="min-w-40">
        <select className="input py-1.5" defaultValue={r.supplierId} onChange={(e) => save({ supplierId: Number(e.target.value) })}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td className="min-w-56"><NatureSelect value={r.nature ?? ""} options={natures} onChange={(v) => save({ nature: v })} /></td>
      <td className="min-w-56">
        <input className="input py-1.5 font-medium" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && save({ name: e.target.value })} />
        <label className="mt-1.5 flex items-center gap-2 text-xs" title={m.lockedHint}>
          <input type="checkbox" defaultChecked={r.priceLocked} className="h-4 w-4 accent-brand-600" onChange={(e) => save({ priceLocked: e.target.checked })} /> 🔒 {m.locked}
        </label>
      </td>
      <td className="min-w-24"><UnitSelect className="input py-1.5" value={unit} units={units} onChange={(u) => { setUnit(u); save({ unit: u }); }} /></td>
      <td className="min-w-24"><input className="input py-1.5 text-right" inputMode="decimal" defaultValue={str(r.priceMin)} onBlur={(e) => e.target.value !== str(r.priceMin) && save({ priceMin: e.target.value })} /></td>
      <td className="min-w-24"><input className="input py-1.5 text-right" inputMode="decimal" defaultValue={str(r.price)} onBlur={(e) => e.target.value !== str(r.price) && save({ price: e.target.value })} /></td>
      <td className="whitespace-nowrap text-right">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs text-red-600"
          disabled={pending}
          onClick={() => { if (confirm(r.active ? t.suppliers.deleteWarning : `${t.suppliers.reactivate} ?`)) start(() => setProductActiveAction(r.id, !r.active)); }}
        >
          {r.active ? t.suppliers.deactivate : t.suppliers.reactivate}
        </button>
        <button className="btn-secondary px-2 py-1" onClick={() => setEdit(false)} aria-label={t.common.close}><Icon name="check" className="h-4 w-4" /></button>
      </td>
    </tr>
  );
}
