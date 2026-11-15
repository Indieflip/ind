"use client";
import { MoneyInput } from "@/components/MoneyInput";
import { appConfirm } from "@/components/Confirm";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addProductAction, addSupplierAction, deleteSupplierAction, importCatalogAction, updateProductAction, updateSupplierAction } from "@/lib/actions/suppliers";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SupplierCombo } from "@/components/SupplierCombo";
import { StatusBadge } from "@/components/DecisionBadge";
import { DataTable, type Col } from "@/components/table/DataTable";
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
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = { name, email, phone, notes };
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const dirty = v.name !== name || v.email !== email || v.phone !== phone || v.notes !== notes;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setSaved(false); };
  return (
    <form
      className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.name.trim()) return;
        start(async () => { await updateSupplierAction(id, v); setSaved(true); router.refresh(); });
      }}
    >
      <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">{t.suppliers.contact}</h2>
      <label><span className="label">{t.suppliers.supplierName} *</span><input className="input" required value={v.name} onChange={set("name")} /></label>
      <label><span className="label">{t.suppliers.email}</span><input className="input" type="email" value={v.email} onChange={set("email")} /></label>
      <label><span className="label">{t.suppliers.phone}</span><input className="input" value={v.phone} onChange={set("phone")} /></label>
      <label><span className="label">{t.common.notes}</span><input className="input" value={v.notes} onChange={set("notes")} /></label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <button className="btn-primary" disabled={pending || !dirty}><Icon name="check" className="h-4 w-4" /> {t.common.save}</button>
        {dirty && <button type="button" className="btn-ghost" onClick={() => setV(initial)}>{t.common.cancel}</button>}
        {saved && !dirty && <span className="text-sm text-emerald-700">{t.suppliers.saved}</span>}
        <button
          type="button"
          className={`ml-auto ${active ? "btn-ghost text-red-600" : "btn-secondary"}`}
          disabled={pending}
          onClick={async () => { if (await appConfirm(active ? t.suppliers.deleteWarning : `${t.suppliers.reactivate} ?`)) start(async () => { await updateSupplierAction(id, { active: !active }); router.refresh(); }); }}
        >
          {active ? t.suppliers.deactivate : t.suppliers.reactivate}
        </button>
      </div>
    </form>
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
      <label><span className="label">{t.common.price} HT</span><MoneyInput name="price" /></label>
      <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.common.add}</button>
    </form>
  );
}

/** Recherche d'un fournisseur : saisie avec suggestions, ouvre son compte */
export function SupplierSearch({ suppliers }: { suppliers: { id: number; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  return <SupplierCombo key={suppliers.length} suppliers={suppliers} name="goto" placeholder={t.suppliers.searchSupplier} searchButton={t.search.button} onChange={(id) => id && router.push(`/mercurial/fournisseurs/${id}`)} />;
}

interface AnomalyRow { id: number; date: string; dateSort: string; type: string; product: string; description: string; status: string; statusLabel: string; receptionId: number | null }

export function SupplierAnomalies({ rows, supplierId }: { rows: AnomalyRow[]; supplierId: number }) {
  const { t } = useI18n();
  const cols: Col<AnomalyRow>[] = [
    { key: "date", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateSort, className: "whitespace-nowrap" },
    { key: "type", label: t.anomalies.type, text: (r) => r.type },
    { key: "product", label: t.common.product, text: (r) => r.product },
    { key: "description", label: t.anomalies.description, text: (r) => r.description },
    { key: "status", label: t.common.status, text: (r) => r.statusLabel, render: (r) => <StatusBadge status={r.status} label={r.statusLabel} /> },
    { key: "bl", label: t.receptions.bl, text: () => "", sortable: false, filterable: false, render: (r) => (r.receptionId ? <Link className="text-brand-700" href={`/receptions/${r.receptionId}`}>→</Link> : "") },
  ];
  return (
    <>
      <div className="flex justify-end"><Link href={`/anomalies?supplier=${supplierId}&status=`} className="text-sm text-brand-700 underline">{t.nav.anomalies} →</Link></div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} empty={t.mercurial.noAnomalies} defaultSort={{ key: "date", dir: "desc" }} />
    </>
  );
}

interface RecRow { id: number; blNumber: string | null; date: string; dateSort: string; lines: number; status: string; statusLabel: string; consolidated: boolean; author: string | null }

/** Réceptions du fournisseur */
export function SupplierReceptions({ rows }: { rows: RecRow[] }) {
  const { t } = useI18n();
  const cols: Col<RecRow>[] = [
    { key: "bl", label: t.receptions.bl, text: (r) => r.blNumber ?? "", href: (r) => `/receptions/${r.id}`, render: (r) => r.blNumber || t.receptions.noBl },
    { key: "date", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateSort, href: (r) => `/receptions/${r.id}`, className: "whitespace-nowrap" },
    { key: "lines", label: t.mercurial.products, align: "right", text: (r) => String(r.lines), sort: (r) => r.lines },
    { key: "status", label: t.common.status, text: (r) => r.statusLabel, render: (r) => <StatusBadge status={r.status} label={r.statusLabel} /> },
    { key: "state", label: t.nav.consolidation, text: (r) => (r.consolidated ? t.receptions.consolidated : t.receptions.toConsolidate) },
    { key: "author", label: t.receptions.createdBy, text: (r) => r.author ?? "" },
  ];
  return <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} empty={t.receptions.empty} defaultSort={{ key: "date", dir: "desc" }} />;
}

/** Suppression d'un fournisseur (administrateur), avec transfert possible vers un autre fournisseur (doublon) */
export function DeleteSupplier({ id, name, others }: { id: number; name: string; others: { id: number; name: string }[] }) {
  const { t } = useI18n();
  const s = t.suppliers;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" onClick={() => setOpen(true)}>
        <Icon name="trash" className="h-4 w-4" /> {s.delete}
      </button>
    );
  }
  return (
    <div className="card w-full space-y-3 border-red-200 bg-red-50/40 p-4">
      <h2 className="font-semibold text-red-800">{s.deleteTitle} « {name} »</h2>
      <label className="block">
        <span className="label">{s.transferTo}</span>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{s.noTransfer}</option>
          {others.filter((o) => o.id !== id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <span className="mt-1 block text-xs text-stone-600">{target ? s.transferHint : s.noTransferHint}</span>
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t.common.cancel}</button>
        <button
          type="button"
          className="btn bg-red-600 text-white hover:bg-red-700"
          disabled={pending}
          onClick={async () => {
            if (!(await appConfirm(`${s.deleteConfirm}\n${name}`, { danger: true }))) return;
            start(async () => {
              await deleteSupplierAction(id, target ? Number(target) : null);
              router.push(target ? `/mercurial/fournisseurs/${target}` : "/mercurial/fournisseurs");
              router.refresh();
            });
          }}
        >
          <Icon name="trash" className="h-4 w-4" /> {s.delete}
        </button>
      </div>
    </div>
  );
}
