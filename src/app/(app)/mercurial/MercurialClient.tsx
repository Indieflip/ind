"use client";
import { MoneyInput } from "@/components/MoneyInput";
import { appConfirm } from "@/components/Confirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addMercurialRowAction, addUnitAction, deleteUnitAction, renameUnitAction, setProductActiveAction, updateMercurialRowAction,
} from "@/lib/actions/mercurial";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { UnitSelect } from "@/components/UnitSelect";
import { NatureSelect } from "@/components/NatureSelect";
import { SupplierCombo } from "@/components/SupplierCombo";
import { ActiveFilters, FilterInput, Pager, ResetFilters } from "@/components/table/FilterInput";
import { useTable, type ColumnDef } from "@/components/table/useTable";
import { SortTh } from "@/components/table/DataTable";

interface Opt { id: number; name: string }
interface Row {
  id: number; supplierId: number; supplier: string; nature: string | null;
  name: string; unit: string; priceMin: number | null; price: number | null; priceLocked: boolean; active: boolean;
  /** Produit de l'onglet Fruits et légumes (prix du mois en cours) */
  fv: boolean;
}

export function AddRow({ suppliers, units, natures, fixedSupplier }: { suppliers: Opt[]; units: string[]; natures: string[]; fixedSupplier?: Opt }) {
  const { t } = useI18n();
  const m = t.mercurial;
  const router = useRouter();
  const [state, action, pending] = useActionState(addMercurialRowAction, undefined);
  const [supplierId, setSupplierId] = useState(fixedSupplier ? String(fixedSupplier.id) : "");
  const [unit, setUnit] = useState(units[0] ?? "Kg");
  const [natureKey, setNatureKey] = useState(0);
  const [supplierKey] = useState(0);
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
      <h2 className="font-semibold">{m.addProduct}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.6fr_1fr_0.8fr_0.8fr]">
        <div>
          <span className="label">{t.common.supplier} *</span>
          {fixedSupplier ? (
            <>
              <input type="hidden" name="supplierId" value={fixedSupplier.id} />
              <p className="input bg-stone-50 font-medium">{fixedSupplier.name}</p>
            </>
          ) : (
          <SupplierCombo
            key={supplierKey}
            suppliers={suppliers}
            value={supplierId ? Number(supplierId) : null}
            onChange={(id) => setSupplierId(id ? String(id) : "")}
            placeholder={t.common.search}
            required
            extraOption={{ label: m.addSupplierLink, onPick: () => router.push("/mercurial/fournisseurs#new") }}
          />
          )}
        </div>
        <label><span className="label">{m.products} *</span><input name="name" className="input" required /></label>
        <label><span className="label">{t.common.unit} *</span><UnitSelect name="unit" value={unit} units={units} onChange={setUnit} required /></label>
        <label><span className="label">{m.priceMin}</span><MoneyInput name="priceMin" /></label>
        <label><span className="label">{m.priceMax}</span><MoneyInput name="price" /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <div>
          <span className="label">{m.nature}</span>
          <NatureSelect key={natureKey} name="nature" value="" options={natures} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm" title={m.lockedHint}>
          <input type="checkbox" name="priceLocked" className="h-4 w-4 accent-brand-600" /> 🔒 {m.locked}
        </label>
        <button className="btn-primary" disabled={pending || !supplierId}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button>
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
    <div className="card space-y-2 p-3">
      <h2 className="text-sm font-semibold">{t.mercurial.units}</h2>
      <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {units.map((u) => (
          <li key={u.id} className="flex items-center gap-0.5 rounded-full border border-stone-300 bg-white py-0 pl-2 pr-0.5 text-xs">
            <input
              className="bg-transparent outline-none"
              size={Math.max(3, u.name.length)}
              defaultValue={u.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== u.name && start(() => renameUnitAction(u.id, e.target.value))}
            />
            <button
              type="button"
              className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
              aria-label={t.common.delete}
              onClick={async () => {
                if (!await appConfirm(`${t.mercurial.unitDeleteConfirm}\n${u.name}`)) return;
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
        <input className="input py-1.5 text-sm" value={name} placeholder={t.mercurial.addUnit} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn-secondary py-1.5" disabled={!name.trim() || pending} onClick={() => start(async () => { await addUnitAction(name); setName(""); })}>
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function MercurialTable({ rows, suppliers, units, natures, editable }: {
  rows: Row[]; suppliers: Opt[]; units: string[]; natures: string[]; editable: boolean;
}) {
  const { t, locale } = useI18n();
  const m = t.mercurial;
  const [lockedOnly, setLockedOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const money = (n: number | null) => (n != null ? fmtMoney(n, locale) : "");
  const cols: ColumnDef<Row>[] = useMemo(
    () => [
      { key: "supplier", text: (r) => r.supplier, options: suppliers.map((s) => s.name) },
      { key: "nature", text: (r) => r.nature ?? "", options: natures },
      { key: "name", text: (r) => r.name },
      { key: "unit", text: (r) => r.unit, options: units },
      { key: "priceMin", text: (r) => money(r.priceMin), sort: (r) => r.priceMin },
      { key: "price", text: (r) => money(r.price), sort: (r) => r.price },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers, natures, units, locale],
  );
  const base = useMemo(() => rows.filter((r) => (showInactive || r.active) && (!lockedOnly || r.priceLocked)), [rows, showInactive, lockedOnly]);
  const tb = useTable(base, cols, { pageSize: 1000 });
  const labels: Record<string, [string, "right" | undefined]> = {
    supplier: [t.common.supplier, undefined], nature: [m.nature, undefined], name: [m.products, undefined], unit: [t.common.unit, undefined],
    priceMin: [m.priceMin, "right"], price: [m.priceMax, "right"],
  };
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 rounded bg-sky-50 px-2 py-1 text-sky-900">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={lockedOnly} onChange={(e) => setLockedOnly(e.target.checked)} /> 🔒 {m.lockedOnly}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {m.showInactive}
        </label>
        <span className="text-stone-500">{tb.active ? "" : `${tb.filtered.length} ${m.count}`}{editable && ` · ${m.priceTraced}`}</span>
      </div>
      <div className="card overflow-hidden">
        <ActiveFilters filters={tb.filters} labels={Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, v[0]]))} onChange={tb.setFilter} onReset={tb.reset} count={tb.filtered.length} total={base.length} unit={m.count} />
        <div className="max-h-[75vh] overflow-y-auto">
          <table className="table">
            <colgroup>
              <col className="w-[15%]" /><col className="w-[12%]" /><col /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[9%]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                {cols.map((c) => <SortTh key={c.key} label={labels[c.key][0]} align={labels[c.key][1]} active={tb.sort?.key === c.key} dir={tb.sort?.dir} onClick={() => tb.toggleSort(c.key)} />)}
                <th />
              </tr>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className="bg-white py-1.5">
                    <FilterInput value={tb.filters[c.key] ?? ""} onChange={(v) => tb.setFilter(c.key, v)} options={tb.options[c.key]} />
                  </th>
                ))}
                <th className="bg-white py-1.5 text-right"><ResetFilters onClick={tb.reset} active={tb.active} /></th>
              </tr>
            </thead>
            <tbody>
              {tb.pageRows.map((r) => <MercurialRow key={r.id} r={r} suppliers={suppliers} units={units} natures={natures} editable={editable} />)}
            </tbody>
          </table>
        </div>
        <Pager page={tb.page} pages={tb.pages} total={tb.filtered.length} pageSize={tb.pageSize} onPage={tb.setPage} />
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
        <td className="text-stone-600">{r.supplier}</td>
        <td className="text-stone-600">{r.nature ?? ""}</td>
        <td className="font-medium">
          {r.name}
          {r.priceLocked && <span className="ml-1.5 badge bg-sky-100 text-sky-800" title={m.lockedHint}>🔒 {m.locked}</span>}
          {r.fv && <span className="ml-1.5 badge bg-lime-100 text-lime-800">{m.fvTag}</span>}
        </td>
        <td>{r.unit}</td>
        <td className="whitespace-nowrap text-right tabular-nums">{r.priceMin != null ? fmtMoney(r.priceMin, locale) : ""}</td>
        <td className="whitespace-nowrap text-right tabular-nums">{r.price != null ? fmtMoney(r.price, locale) : ""}</td>
        <td className="text-right">
          {editable && !r.fv && <button className="btn-ghost px-1.5 py-1 text-xs" onClick={() => setEdit(true)} title={t.common.edit}><Icon name="edit" className="h-3.5 w-3.5" /> <span className="hidden xl:inline">{t.common.edit}</span></button>}
          {editable && r.fv && <Link href="/mercurial/fruits-legumes" className="btn-ghost px-1.5 py-1 text-xs" title={m.fvEdit}><Icon name="leaf" className="h-3.5 w-3.5" /> <span className="hidden xl:inline">{t.common.edit}</span></Link>}
        </td>
      </tr>
    );
  }
  return (
    <tr className="bg-brand-50/40 align-top">
      <td>
        <select className="input py-1.5" defaultValue={r.supplierId} onChange={(e) => save({ supplierId: Number(e.target.value) })}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      <td><NatureSelect value={r.nature ?? ""} options={natures} onChange={(v) => save({ nature: v })} /></td>
      <td>
        <input className="input py-1.5 font-medium" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && save({ name: e.target.value })} />
        <label className="mt-1.5 flex items-center gap-2 text-xs" title={m.lockedHint}>
          <input type="checkbox" defaultChecked={r.priceLocked} className="h-4 w-4 accent-brand-600" onChange={(e) => save({ priceLocked: e.target.checked })} /> 🔒 {m.locked}
        </label>
      </td>
      <td><UnitSelect className="input py-1.5" value={unit} units={units} onChange={(u) => { setUnit(u); save({ unit: u }); }} /></td>
      <td><MoneyInput className="input py-1.5 text-right" defaultValue={str(r.priceMin)} onBlur={(e) => e.target.value !== str(r.priceMin) && save({ priceMin: e.target.value })} /></td>
      <td><MoneyInput className="input py-1.5 text-right" defaultValue={str(r.price)} onBlur={(e) => e.target.value !== str(r.price) && save({ price: e.target.value })} /></td>
      <td className="text-right">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs text-red-600"
          disabled={pending}
          onClick={async () => { if (await appConfirm(r.active ? t.suppliers.deleteWarning : `${t.suppliers.reactivate} ?`)) start(() => setProductActiveAction(r.id, !r.active)); }}
        >
          {r.active ? t.suppliers.deactivate : t.suppliers.reactivate}
        </button>
        <button className="btn-secondary px-2 py-1" onClick={() => setEdit(false)} aria-label={t.common.close}><Icon name="check" className="h-4 w-4" /></button>
      </td>
    </tr>
  );
}
