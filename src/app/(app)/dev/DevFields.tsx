"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDevFieldAction, saveDevFieldAction } from "@/lib/actions/dev";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface FieldRow { id: number; form: string; section: string; field: string; required: boolean; rule: string; message: string; position: number }
export interface NatureRow { category: string; natures: { name: string; count: number }[]; products: number; threshold: string }

const FORMS = ["reception", "anomaly", "claim", "weigh", "product", "supplier", "sheet", "credit"] as const;

/** Dev > Caractéristiques : récapitulatif Catégorie / Nature des produits + champs des fiches (obligatoire, règle de saisie, message) */
export function DevFields({ fields, natures }: { fields: FieldRow[]; natures: NatureRow[] }) {
  const { t } = useI18n();
  const c = t.devFields;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<string>("all");
  const [edit, setEdit] = useState<Partial<FieldRow> | null>(null);
  const list = fields.filter((f) => form === "all" || f.form === form);
  const save = (row: Partial<FieldRow>) =>
    start(async () => {
      await saveDevFieldAction(row.id ?? null, { form: row.form ?? "reception", section: row.section ?? "", field: row.field ?? "", required: !!row.required, rule: row.rule ?? "", message: row.message ?? "" });
      setEdit(null);
      router.refresh();
    });
  const cols: Col<FieldRow>[] = [
    { key: "form", label: c.form, text: (r) => c.forms[r.form as "reception"] ?? r.form, options: FORMS.map((f) => c.forms[f]), width: "11%" },
    { key: "section", label: c.section, text: (r) => r.section, keepCase: true, width: "13%" },
    { key: "field", label: c.field, text: (r) => r.field, keepCase: true, width: "17%", className: "font-medium" },
    {
      key: "required", label: c.required, align: "center", text: (r) => (r.required ? t.common.yes : t.common.no), options: [t.common.yes, t.common.no], width: "8%",
      render: (r) => <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={r.required} disabled={pending} onChange={(e) => save({ ...r, required: e.target.checked })} aria-label={c.required} />,
    },
    { key: "rule", label: c.rule, text: (r) => r.rule, keepCase: true, width: "25%", className: "text-stone-700" },
    { key: "message", label: c.message, text: (r) => r.message, keepCase: true, width: "20%", className: "text-stone-600 italic" },
    {
      key: "actions", label: "", sortable: false, width: "6%", text: () => "",
      render: (r) => (
        <span className="flex gap-0.5">
          <button type="button" className="btn-ghost p-1.5" onClick={() => setEdit(r)} aria-label={t.common.edit}><Icon name="edit" className="h-4 w-4" /></button>
          <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" onClick={async () => { if (await appConfirm(c.deleteConfirm)) start(async () => { await deleteDevFieldAction(r.id); router.refresh(); }); }} aria-label={t.common.delete}><Icon name="trash" className="h-4 w-4" /></button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{c.naturesTitle}</h2>
        <p className="px-4 text-xs text-stone-500">{c.naturesHint}</p>
        <table className="table mt-2">
          <thead><tr><th>{c.category}</th><th>{c.natures}</th><th className="text-right">{c.products}</th><th>{c.threshold}</th></tr></thead>
          <tbody>
            {natures.map((n) => (
              <tr key={n.category} className="align-top">
                <td className="font-medium">{n.category}</td>
                <td><div className="flex flex-wrap gap-1">{n.natures.map((x) => <span key={x.name} className="badge bg-stone-100 text-stone-700">{x.name} <span className="ml-1 text-stone-400">{x.count}</span></span>)}</div></td>
                <td className="text-right tabular-nums">{n.products}</td>
                <td className="text-sm text-stone-600">{n.threshold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">{c.fieldsTitle}</h2>
            <p className="text-xs font-medium text-brand-700">{c.autoUpdated}</p>
            <p className="max-w-3xl text-xs text-stone-500">{c.fieldsHint}</p>
          </div>
          {!edit && <button type="button" className="btn-primary py-1.5" onClick={() => setEdit({ form: form === "all" ? "reception" : form, required: false })}><Icon name="plus" className="h-4 w-4" /> {t.common.add}</button>}
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {(["all", ...FORMS] as const).map((f) => (
            <button key={f} type="button" onClick={() => setForm(f)} className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${form === f ? "bg-brand-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}>
              {f === "all" ? c.all : c.forms[f]} <span className="text-xs opacity-70">({f === "all" ? fields.length : fields.filter((x) => x.form === f).length})</span>
            </button>
          ))}
        </div>
        {edit && (
          <div className="card mb-3 grid gap-2 p-3 md:grid-cols-6">
            <label><span className="label">{c.form}</span><select className="input" value={edit.form} onChange={(e) => setEdit({ ...edit, form: e.target.value })}>{FORMS.map((f) => <option key={f} value={f}>{c.forms[f]}</option>)}</select></label>
            <label><span className="label">{c.section}</span><input className="input" value={edit.section ?? ""} onChange={(e) => setEdit({ ...edit, section: e.target.value })} /></label>
            <label className="md:col-span-2"><span className="label">{c.field} *</span><input className="input" value={edit.field ?? ""} onChange={(e) => setEdit({ ...edit, field: e.target.value })} /></label>
            <label className="flex items-end gap-2 pb-2.5 text-sm font-medium"><input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!edit.required} onChange={(e) => setEdit({ ...edit, required: e.target.checked })} /> {c.required}</label>
            <span />
            <label className="md:col-span-3"><span className="label">{c.rule}</span><textarea className="input" rows={2} value={edit.rule ?? ""} onChange={(e) => setEdit({ ...edit, rule: e.target.value })} /></label>
            <label className="md:col-span-3"><span className="label">{c.message}</span><textarea className="input" rows={2} value={edit.message ?? ""} onChange={(e) => setEdit({ ...edit, message: e.target.value })} /></label>
            <div className="flex gap-2 md:col-span-6">
              <button type="button" className="btn-primary" disabled={pending || !edit.field?.trim()} onClick={() => save(edit)}>{t.common.save}</button>
              <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>{t.common.cancel}</button>
            </div>
          </div>
        )}
        <DataTable rows={list} cols={cols} rowKey={(r) => r.id} dense fixed defaultSort={{ key: "form", dir: "asc" }} empty={c.empty} />
      </section>
    </div>
  );
}
