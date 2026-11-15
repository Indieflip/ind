"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addContainerAction, deleteContainerAction, updateContainerAction, type ContainerInput } from "@/lib/actions/containers";
import { useI18n } from "@/lib/i18n/client";
import { fmtNum } from "@/lib/format";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface ContainerRow { id: number; supplier: string; product: string; tare: number | null; container: string }

const empty: ContainerInput = { supplier: "", product: "", tare: "", container: "" };

/** Liste des contenants (tares en kg) : filtres d'en-tête, ajout avec « + », modification d'une ligne */
export function ContainersTable({ rows, editable }: { rows: ContainerRow[]; editable: boolean }) {
  const { t, locale } = useI18n();
  const c = t.containers;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const [form, setForm] = useState<ContainerInput>(empty);
  const [pending, start] = useTransition();
  const toInput = (r: ContainerRow): ContainerInput => ({ supplier: r.supplier, product: r.product, tare: r.tare != null ? String(r.tare).replace(".", ",") : "", container: r.container });
  const save = () =>
    start(async () => {
      if (edit != null) await updateContainerAction(edit, form);
      else await addContainerAction(form);
      setEdit(null);
      setAdding(false);
      setForm(empty);
      router.refresh();
    });
  const field = (k: keyof ContainerInput, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="min-w-0">
      <span className="label">{label}</span>
      <input className="input py-1.5 text-sm" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...props} />
    </label>
  );
  const cols: Col<ContainerRow>[] = [
    { key: "supplier", label: c.supplier, text: (r) => r.supplier, width: "22%" },
    { key: "product", label: t.common.product, text: (r) => r.product, width: "26%" },
    { key: "tare", label: c.tare, align: "right", text: (r) => (r.tare != null ? fmtNum(r.tare, locale, 3) : ""), sort: (r) => r.tare, width: "6.5rem" },
    { key: "container", label: c.container, text: (r) => r.container, className: "whitespace-pre-line" },
    ...(editable
      ? [{
          key: "actions", label: "", text: () => "", sortable: false, filterable: false, width: "4.5rem",
          render: (r: ContainerRow) => (
            <div className="flex gap-0.5">
              <button type="button" className="btn-ghost p-1.5" title={t.common.edit} onClick={() => { setEdit(r.id); setAdding(false); setForm(toInput(r)); }}><Icon name="edit" className="h-4 w-4" /></button>
              <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" title={t.common.delete} onClick={async () => { if (await appConfirm(`${t.common.confirmDelete}\n${r.product} · ${r.container}`)) start(async () => { await deleteContainerAction(r.id); router.refresh(); }); }}><Icon name="trash" className="h-4 w-4" /></button>
            </div>
          ),
        } as Col<ContainerRow>]
      : []),
  ];
  return (
    <section id="contenants" className="mt-6 scroll-mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-brand-700">{c.title}</h2>
          <p className="text-sm text-stone-600">{c.intro}</p>
        </div>
        {editable && !adding && edit == null && (
          <button type="button" className="btn-primary h-9 w-9 shrink-0 p-0 text-xl" title={c.add} aria-label={c.add} onClick={() => { setAdding(true); setForm(empty); }}>+</button>
        )}
      </div>
      {(adding || edit != null) && (
        <div className="card mb-3 grid gap-2 border-brand-200 p-3 sm:grid-cols-[1fr_1.2fr_0.6fr_1.4fr_auto] sm:items-end">
          {field("supplier", c.supplier, { list: "container-suppliers" })}
          {field("product", t.common.product)}
          {field("tare", c.tare, { inputMode: "decimal", placeholder: "0,5" })}
          {field("container", c.container)}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary py-1.5" onClick={() => { setAdding(false); setEdit(null); }}>{t.common.cancel}</button>
            <button type="button" className="btn-primary py-1.5" disabled={pending || (!form.product.trim() && !form.container.trim())} onClick={save}>{t.common.save}</button>
          </div>
          <datalist id="container-suppliers">{[...new Set(rows.map((r) => r.supplier).filter(Boolean))].map((s) => <option key={s} value={s} />)}</datalist>
        </div>
      )}
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} defaultSort={{ key: "supplier", dir: "asc" }} dense fixed maxHeight="max-h-[70vh]" />
    </section>
  );
}
