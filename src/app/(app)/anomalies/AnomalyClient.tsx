"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { consolidateAnomaliesAction, createAnomalyAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { StatusBadge } from "@/components/DecisionBadge";
import { appConfirm } from "@/components/Confirm";
import { DataTable, type Col } from "@/components/table/DataTable";
import { PhotoButton, Thumbs } from "@/components/reception/PhotoButton";
import { PasteRowButton } from "@/components/table/RowMenu";
import { copyRow, type RowFields } from "@/lib/client/rowClipboard";

const NATURES = ["Viande", "Poisson", "Fruits & Légumes", "Crèmerie", "Épicerie", "Boisson", "Boulangerie", "Autre"];

export function AnomalyForm({ receptions, preselect }: { receptions: { id: number; label: string }[]; preselect: number | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!!preselect);
  const [photo, setPhoto] = useState("");
  // Ligne collée depuis un autre tableau : valeurs proposées, modifiables avant d'enregistrer
  const [pre, setPre] = useState<RowFields>({});
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(createAnomalyAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) { ref.current?.reset(); setPhoto(""); setOpen(false); }
  }, [state]);
  if (!open) {
    return (
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> {t.anomalies.new}</button>
        <PasteRowButton onPaste={(f) => { setPre(f); setFormKey((k) => k + 1); setOpen(true); }} />
      </div>
    );
  }
  const recPre = pre.receptionId && receptions.some((r) => String(r.id) === pre.receptionId) ? pre.receptionId : preselect ?? "";
  return (
    <form key={formKey} ref={ref} action={action} id="new" className="no-print card mb-4 space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t.anomalies.new}</h2>
        <button type="button" className="btn-ghost p-1.5" onClick={() => setOpen(false)}><Icon name="x" className="h-4 w-4" /></button>
      </div>
      <label className="block">
        <span className="label">{t.anomalies.chooseReception} *</span>
        <select name="receptionId" className="input" required defaultValue={recPre}>
          <option value="" />
          {receptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <span className="mt-1 block text-xs text-stone-500">{t.anomalies.receptionHint}</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-4">
        <label>
          <span className="label">{t.anomalies.nature}</span>
          <input name="nature" className="input" list="anomaly-natures" defaultValue={pre.nature ?? ""} />
          <datalist id="anomaly-natures">{NATURES.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
        <label>
          <span className="label">{t.anomalies.type}</span>
          <select name="type" className="input" defaultValue="missing">
            {Object.entries(t.anomalies.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="label">{t.common.product}</span><input name="productName" className="input" defaultValue={pre.product ?? ""} /></label>
        <label><span className="label">{t.anomalies.nextAction}</span><input type="date" name="nextActionAt" className="input" /></label>
      </div>
      <label className="block">
        <span className="label">{t.anomalies.problem} *</span>
        <textarea name="description" className="input" rows={2} required placeholder={t.anomalies.descriptionPlaceholder} defaultValue={pre.description ?? pre.detail ?? ""} />
      </label>
      <input type="hidden" name="photo" value={photo} />
      <Thumbs photos={photo ? [photo] : []} onRemove={async () => { if (await appConfirm(t.wizard.removePhotoConfirm)) setPhoto(""); }} />
      <div className="flex flex-wrap gap-2">
        {!photo && <PhotoButton label={t.common.photo} onPhotos={(p) => setPhoto(p[0])} />}
        <button className="btn-primary" disabled={pending}>{t.common.save}</button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{t.common.error}</p>}
    </form>
  );
}

export interface AnomalyRow {
  id: number; number: number | null; numberFinal: boolean; date: string; dateSort: string; nature: string; supplier: string; supplierId: number | null; reference: string; product: string; problem: string;
  action: string; lastActionAt: string; result: string; saving: number | null; status: string; statusLabel: string;
  type: string; nextActionAt: string; due: boolean; receptionId: number | null; photoUrl: string | null; consolidated?: string;
}

/** Anomalies : à suivre aujourd'hui, suivi (colonnes du fichier), consolidation */
export function AnomaliesBoard({ rows, consolidated, canManage, canConsolidate, today }: { rows: AnomalyRow[]; consolidated: AnomalyRow[]; canManage: boolean; canConsolidate: boolean; today: string }) {
  const { t, locale } = useI18n();
  const a = t.anomalies;
  const router = useRouter();
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [edit, setEdit] = useState<AnomalyRow | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [pending, start] = useTransition();
  const due = rows.filter((r) => r.due);
  // Menu ⋮ : copier la ligne (à coller dans un autre tableau) ou en faire une réclamation
  const fieldsOf = (r: AnomalyRow): RowFields => ({
    date: r.dateSort.slice(0, 10), nature: r.nature, supplier: r.supplier, supplierId: r.supplierId ? String(r.supplierId) : "", reference: r.reference,
    product: r.product, description: r.problem, action: r.action, result: r.result, amount: r.saving != null ? String(r.saving) : "",
    receptionId: r.receptionId ? String(r.receptionId) : "", anomalyId: String(r.id),
  });
  const copySpec = {
    source: a.title,
    fields: fieldsOf,
    actions: (r: AnomalyRow) => [{ label: `⚑ ${t.claims.create}`, onClick: () => { copyRow(a.title, fieldsOf(r)); router.push("/anomalies/reclamations?from=row"); } }],
  };
  const totalSaving = [...rows, ...consolidated].reduce((s, r) => s + (r.saving ?? 0), 0);
  const cols: Col<AnomalyRow>[] = [
    {
      key: "number", width: "3.25rem", label: a.number, text: (r) => (r.number != null ? String(r.number) : ""), sort: (r) => r.number,
      render: (r) => (r.number == null ? "—" : r.numberFinal ? <strong>{r.number}</strong> : <span className="italic text-stone-400" title={a.provisional}>{r.number}</span>),
    },
    { key: "date", width: "5.25rem", label: a.deliveryDate, text: (r) => r.date, sort: (r) => r.dateSort, className: "" },
    { key: "nature", width: "4.5rem", label: a.nature, text: (r) => r.nature },
    { key: "supplier", width: "7.5%", label: t.common.supplier, text: (r) => r.supplier, render: (r) => (r.supplierId ? <Link className="text-brand-700 hover:underline" href={`/mercurial/fournisseurs/${r.supplierId}`}>{r.supplier}</Link> : r.supplier) },
    { key: "reference", width: "7%", label: a.blInvoice, text: (r) => r.reference, render: (r) => (r.receptionId ? <Link className="text-brand-700 hover:underline" href={`/receptions/${r.receptionId}`}>{r.reference || "—"}</Link> : r.reference || "—") },
    { key: "product", width: "8.5%", label: t.common.product, text: (r) => r.product },
    { key: "problem", label: a.problem, text: (r) => r.problem, className: "whitespace-pre-wrap" },
    { key: "action", label: a.action, text: (r) => r.action, className: "whitespace-pre-wrap" },
    { key: "lastActionAt", width: "4.75rem", label: a.lastAction, text: (r) => (r.lastActionAt ? fmtDate(r.lastActionAt, locale) : ""), sort: (r) => r.lastActionAt, className: "whitespace-nowrap" },
    { key: "result", width: "7%", label: a.result, text: (r) => r.result },
    { key: "saving", width: "4.75rem", label: a.saving, align: "right", text: (r) => (r.saving != null ? fmtMoney(r.saving, locale) : ""), sort: (r) => r.saving, filterable: false },
    {
      key: "status", width: "5.25rem", label: t.common.status, text: (r) => r.statusLabel,
      render: (r) => (
        <div className="space-y-1">
          <StatusBadge status={r.status} label={r.statusLabel} />
          {r.nextActionAt && <div className={`text-[11px] ${r.due ? "font-semibold text-red-700" : "text-stone-500"}`}>{a.nextActionShort} {fmtDate(r.nextActionAt, locale)}</div>}
        </div>
      ),
    },
    ...(canManage
      ? [{ key: "edit", width: "2rem", label: "", text: () => "", sortable: false, filterable: false, render: (r: AnomalyRow) => <button className="btn-ghost p-1.5" title={t.common.edit} onClick={() => setEdit(r)}><Icon name="edit" className="h-4 w-4" /></button> } as Col<AnomalyRow>]
      : []),
  ];

  return (
    <>
      {/* Rappel du jour */}
      <section className={`mb-4 rounded-xl border p-4 ${due.length ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
        <h2 className={`font-semibold ${due.length ? "text-red-800" : "text-emerald-800"}`}>
          {a.dueToday} ({due.length})
        </h2>
        {due.length === 0 ? (
          <p className="text-sm text-emerald-800">{a.nothingDue}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {due.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-red-700">{fmtDate(r.nextActionAt, locale)}</span>
                <strong>{r.supplier}</strong> · {r.product || r.problem}
                {canManage && <button className="ml-auto text-xs font-semibold text-red-800 underline" onClick={() => setEdit(r)}>{a.followUpNow}</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        {canConsolidate && (
          <button
            className="btn-primary"
            disabled={!sel.size || pending}
            onClick={async () => {
              if (!(await appConfirm(a.consolidateConfirm, { danger: false }))) return;
              start(async () => {
                await consolidateAnomaliesAction([...sel].map(Number));
                setSel(new Set());
                router.refresh();
              });
            }}
          >
            <Icon name="layers" className="h-4 w-4" /> {a.consolidate} {sel.size > 0 && `(${sel.size})`}
          </button>
        )}
        <span className="text-xs italic text-stone-400">{a.provisional}</span>
        <span className="text-stone-500">{rows.length} {a.openCount} · {a.saving} : {fmtMoney(totalSaving, locale)}</span>
      </div>
      <DataTable copy={copySpec} rows={rows} cols={cols} rowKey={(r) => r.id} empty={a.empty} selectable={canConsolidate} selection={sel} onSelectionChange={setSel} defaultSort={{ key: "date", dir: "desc" }} dense fixed rowClassName={(r) => (r.due ? "bg-red-50/60" : "")} />

      <button className="btn-ghost mt-4 px-0 text-sm text-brand-700" onClick={() => setShowDone((v) => !v)}>
        {showDone ? "▾" : "▸"} {a.consolidatedList} ({consolidated.length})
      </button>
      {showDone && (
        <div className="mt-2">
          <DataTable
            rows={consolidated}
            cols={[...cols.filter((c) => c.key !== "edit" && c.key !== "status"), { key: "consolidated", width: "9rem", label: t.receptions.consolidatedOn, text: (r) => r.consolidated ?? "", className: "text-stone-600" }]}
            rowKey={(r) => r.id}
            dense
            fixed
            copy={copySpec}
            maxHeight="max-h-[60vh]"
          />
        </div>
      )}

      {edit && <AnomalyEditor row={edit} onClose={() => setEdit(null)} today={today} />}
    </>
  );
}

function AnomalyEditor({ row, onClose, today }: { row: AnomalyRow; onClose: () => void; today: string }) {
  const { t } = useI18n();
  const a = t.anomalies;
  const router = useRouter();
  const [v, setV] = useState({
    nature: row.nature, description: row.problem, followUp: row.action, lastActionAt: row.lastActionAt || today,
    result: row.result, creditAmount: row.saving != null ? String(row.saving).replace(".", ",") : "", status: row.status, nextActionAt: row.nextActionAt,
  });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{row.supplier}</h2>
            <p className="text-sm text-stone-600">{row.date} · {row.product}</p>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t.common.close}><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="label">{a.nature}</span><input className="input" list="anomaly-natures" value={v.nature} onChange={set("nature")} /></label>
          <label>
            <span className="label">{t.common.status}</span>
            <select className="input" value={v.status} onChange={set("status")}>
              {Object.entries(a.statuses).map(([k, x]) => <option key={k} value={k}>{x}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2"><span className="label">{a.problem}</span><textarea className="input" rows={2} value={v.description} onChange={set("description")} /></label>
          <label className="sm:col-span-2"><span className="label">{a.action}</span><textarea className="input" rows={3} value={v.followUp} onChange={set("followUp")} /></label>
          <label><span className="label">{a.lastAction}</span><input type="date" className="input" value={v.lastActionAt} onChange={set("lastActionAt")} /></label>
          <label><span className="label">{a.nextAction}</span><input type="date" className="input" value={v.nextActionAt} onChange={set("nextActionAt")} /></label>
          <label><span className="label">{a.result}</span><input className="input" list="anomaly-results" value={v.result} onChange={set("result")} /></label>
          <label><span className="label">{a.saving}</span><MoneyInput value={v.creditAmount} onChange={set("creditAmount")} /></label>
          <datalist id="anomaly-results">{a.resultOptions.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t.common.cancel}</button>
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => start(async () => {
              await updateAnomalyAction(row.id, v);
              onClose();
              router.refresh();
            })}
          >
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
