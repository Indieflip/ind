"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addClaimAction, deleteClaimAction, setClaimStatusAction, updateClaimAction, type ClaimInput, type ClaimStatus } from "@/lib/actions/claims";
import { readRow, type RowFields } from "@/lib/client/rowClipboard";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney, sentence } from "@/lib/format";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { DataTable, type Col } from "@/components/table/DataTable";
import { PasteRowButton } from "@/components/table/RowMenu";

export interface ClaimRow {
  id: number; date: string; dateIso: string; supplier: string; supplierId: number | null; reference: string; product: string; subject: string;
  amount: number | null; credit: number | null; notes: string; status: ClaimStatus; anomalyId: number | null; weighGapId: number | null; receptionId: number | null;
  source: "manual" | "anomaly" | "weigh"; anomalyNumber: number | null;
}

import { claimStyles } from "@/lib/anomaly";

const today = () => new Date().toISOString().slice(0, 10);
const empty = (): ClaimInput => ({ date: today(), supplierId: "", supplierName: "", reference: "", product: "", subject: "", amount: "", credit: "", notes: "", status: "en_cours" });
const money = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

export function ClaimsBoard({ rows, suppliers, canCreate, canManage, prefill }: { rows: ClaimRow[]; suppliers: { id: number; name: string }[]; canCreate: boolean; canManage: boolean; prefill?: RowFields }) {
  const { t, locale } = useI18n();
  const c = t.claims;
  const router = useRouter();
  const sp = useSearchParams();
  const [filter, setFilter] = useState<ClaimStatus | "all">("en_cours");
  const [form, setForm] = useState<{ id: number | null; v: ClaimInput; auto?: boolean } | null>(null);
  const [pending, start] = useTransition();

  /** Ligne copiée (anomalie, écart de pesée…) → formulaire pré-rempli, modifiable avant d'enregistrer */
  const fromFields = (f: RowFields): ClaimInput => {
    const sup = f.supplierId ? suppliers.find((s) => String(s.id) === f.supplierId) : suppliers.find((s) => s.name.toLowerCase() === (f.supplier ?? "").toLowerCase());
    return {
      ...empty(),
      date: f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : today(),
      supplierId: sup ? String(sup.id) : "",
      supplierName: sup ? "" : f.supplier ?? "",
      reference: f.reference ?? "",
      product: f.product ?? "",
      subject: f.description ?? f.detail ?? "",
      amount: f.amount ?? "",
      notes: [f.action, f.result].filter(Boolean).join("\n"),
      anomalyId: f.anomalyId, weighGapId: f.weighGapId, receptionId: f.receptionId,
    };
  };
  // Arrivée depuis « Créer une réclamation » (menu ⋮ d'une anomalie ou d'un écart) : formulaire déjà rempli
  useEffect(() => {
    // Depuis la fiche d'une anomalie : réclamation pré-remplie
    if (prefill && canCreate) { setForm({ id: null, v: fromFields(prefill) }); router.replace("/anomalies/reclamations"); return; }
    if (sp.get("from") !== "row" || !canCreate) return;
    const row = readRow();
    if (row) setForm({ id: null, v: fromFields(row.fields) });
    router.replace("/anomalies/reclamations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = { en_cours: 0, cloturee: 0, annulee: 0 } as Record<ClaimStatus, number>;
  for (const r of rows) counts[r.status]++;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const sum = (k: "amount" | "credit") => shown.reduce((s, r) => s + (r[k] ?? 0), 0);

  const cols: Col<ClaimRow>[] = [
    { key: "id", width: "3rem", label: c.number, text: (r) => String(r.id), sort: (r) => r.id },
    {
      key: "source", width: "6.5rem", label: c.origin, text: (r) => (r.source === "anomaly" ? `${c.fromAnomaly} ${r.anomalyNumber ?? ""}` : r.source === "weigh" ? c.fromWeigh : c.fromManual),
      options: [c.fromAnomaly, c.fromWeigh, c.fromManual], keepCase: true,
      render: (r) =>
        r.source === "anomaly" && r.anomalyId ? <Link className="text-brand-700 hover:underline" href={`/anomalies/${r.anomalyId}`}>{c.fromAnomaly} {r.anomalyNumber}</Link>
        : r.source === "weigh" ? <Link className="text-sky-700 hover:underline" href="/anomalies/ecarts-pesee">{c.fromWeigh}</Link>
        : <span className="text-stone-500">{c.fromManual}</span>,
    },
    { key: "date", width: "5rem", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateIso },
    { key: "supplier", width: "9%", label: t.common.supplier, text: (r) => r.supplier, render: (r) => (r.supplierId ? <Link className="text-brand-700 hover:underline" href={`/mercurial/fournisseurs/${r.supplierId}`}>{sentence(r.supplier)}</Link> : sentence(r.supplier) || "—") },
    { key: "reference", width: "8%", label: t.anomalies.blInvoice, text: (r) => r.reference, render: (r) => (r.receptionId ? <Link className="text-brand-700 hover:underline" href={`/receptions/${r.receptionId}`}>{r.reference || "—"}</Link> : r.reference || "—") },
    { key: "product", width: "10%", label: t.common.product, text: (r) => r.product },
    { key: "subject", label: c.subject, text: (r) => r.subject, className: "whitespace-pre-line" },
    { key: "amount", width: "5rem", label: c.amount, align: "right", text: (r) => (r.amount != null ? fmtMoney(r.amount, locale) : ""), sort: (r) => r.amount, filterable: false },
    { key: "credit", width: "5rem", label: c.credit, align: "right", text: (r) => (r.credit != null ? fmtMoney(r.credit, locale) : ""), sort: (r) => r.credit, filterable: false },
    { key: "notes", width: "14%", label: c.notes, text: (r) => r.notes, className: "whitespace-pre-line text-stone-600" },
    {
      key: "status", width: "6.5rem", label: t.common.status, text: (r) => c.statuses[r.status], options: Object.values(c.statuses),
      render: (r) =>
        canManage ? (
          <select className={`w-full rounded-md border-0 px-1.5 py-1 text-xs font-semibold ${claimStyles[r.status]}`} value={r.status} onChange={(e) => start(async () => { await setClaimStatusAction(r.id, e.target.value as ClaimStatus); router.refresh(); })}>
            {(Object.keys(c.statuses) as ClaimStatus[]).map((s) => <option key={s} value={s}>{c.statuses[s]}</option>)}
          </select>
        ) : <span className={`badge ${claimStyles[r.status]}`}>{c.statuses[r.status]}</span>,
    },
    ...(canManage
      ? [{
          key: "edit", width: "2rem", label: "", text: () => "", sortable: false, filterable: false,
          render: (r: ClaimRow) => (
            <button type="button" className="btn-ghost p-1.5" title={t.common.edit} onClick={() => setForm({ id: r.id, auto: r.source !== "manual", v: { date: r.dateIso, supplierId: r.supplierId ? String(r.supplierId) : "", supplierName: r.supplierId ? "" : r.supplier, reference: r.reference, product: r.product, subject: r.subject, amount: money(r.amount), credit: money(r.credit), notes: r.notes, status: r.status, anomalyId: r.anomalyId ? String(r.anomalyId) : undefined, weighGapId: r.weighGapId ? String(r.weighGapId) : undefined, receptionId: r.receptionId ? String(r.receptionId) : undefined } })}>
              <Icon name="edit" className="h-4 w-4" />
            </button>
          ),
        } as Col<ClaimRow>]
      : []),
  ];

  return (
    <>
      {/* Vignettes : En cours, Clôturée, Annulée (cliquer pour filtrer) */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["en_cours", "cloturee", "annulee"] as ClaimStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(filter === s ? "all" : s)} className={`rounded-xl border-2 p-3 text-left transition ${claimStyles[s]} ${filter === s ? "border-current" : "border-transparent opacity-80 hover:opacity-100"}`}>
            <p className="text-2xl font-bold leading-none">{counts[s]}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{c.statuses[s]}</p>
          </button>
        ))}
        <button type="button" onClick={() => setFilter("all")} className={`rounded-xl border-2 bg-white p-3 text-left ${filter === "all" ? "border-brand-600" : "border-stone-200"}`}>
          <p className="text-2xl font-bold leading-none">{rows.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.all}</p>
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {canCreate && !form && <button type="button" className="btn-primary" onClick={() => setForm({ id: null, v: empty() })}><Icon name="plus" className="h-4 w-4" /> {c.new}</button>}
        {canCreate && !form && <PasteRowButton onPaste={(f) => setForm({ id: null, v: fromFields(f) })} />}
        <span className="ml-auto text-sm text-stone-600">{c.amount} : <strong>{fmtMoney(sum("amount"), locale)}</strong> · {c.credit} : <strong>{fmtMoney(sum("credit"), locale)}</strong></span>
      </div>

      {form && (
        <ClaimForm
          initial={form.v}
          editing={form.id != null}
          auto={!!form.auto}
          suppliers={suppliers}
          pending={pending}
          onCancel={() => setForm(null)}
          onDelete={form.id != null && !form.auto ? async () => { if (await appConfirm(t.common.confirmDelete)) start(async () => { await deleteClaimAction(form.id!); setForm(null); router.refresh(); }); } : undefined}
          onSave={(v) => start(async () => {
            const res = form.id != null ? await updateClaimAction(form.id, v) : await addClaimAction(v);
            if (res?.ok) { setForm(null); router.refresh(); }
          })}
        />
      )}

      <DataTable
        rows={shown}
        cols={cols}
        rowKey={(r) => r.id}
        defaultSort={{ key: "date", dir: "desc" }}
        dense
        fixed
        empty={c.empty}
        copy={{ source: c.title, fields: (r) => ({ date: r.dateIso, supplier: r.supplier, supplierId: r.supplierId ? String(r.supplierId) : "", reference: r.reference, product: r.product, description: r.subject, amount: r.amount != null ? String(r.amount) : "", detail: r.notes, receptionId: r.receptionId ? String(r.receptionId) : "" }) }}
      />
    </>
  );
}

function ClaimForm({ initial, editing, auto, suppliers, pending, onSave, onCancel, onDelete }: {
  initial: ClaimInput; editing: boolean; auto: boolean; suppliers: { id: number; name: string }[]; pending: boolean;
  onSave: (v: ClaimInput) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const { t } = useI18n();
  const c = t.claims;
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const set = (k: keyof ClaimInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="card mb-4 space-y-3 border-brand-200 p-4">
      <h2 className="font-semibold">{editing ? c.edit : c.new}</h2>
      {auto && <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-900">{c.autoHint}</p>}
      <div className="grid gap-3 sm:grid-cols-4">
        <label><span className="label">{t.common.date}</span><input type="date" className="input" value={v.date} onChange={set("date")} disabled={auto} /></label>
        <label className="sm:col-span-2">
          <span className="label">{t.common.supplier}</span>
          <select className="input" value={v.supplierId} onChange={set("supplierId")} disabled={auto}>
            <option value="">{v.supplierName ? `${v.supplierName} (${c.notInList})` : "—"}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label><span className="label">{t.common.status}</span>
          <select className="input" value={v.status} onChange={set("status")}>
            {(Object.keys(c.statuses) as ClaimStatus[]).map((s) => <option key={s} value={s}>{c.statuses[s]}</option>)}
          </select>
        </label>
        <label><span className="label">{t.anomalies.blInvoice}</span><input className="input" value={v.reference} onChange={set("reference")} disabled={auto} placeholder="Facture 123 du 12/11/26" /></label>
        <label className="sm:col-span-3"><span className="label">{t.common.product}</span><input className="input" value={v.product} onChange={set("product")} disabled={auto} /></label>
        <label className="sm:col-span-4"><span className="label">{c.subject} *</span><textarea className="input" rows={2} value={v.subject} onChange={set("subject")} disabled={auto} placeholder={c.subjectPlaceholder} /></label>
        <label><span className="label">{c.amount}</span><MoneyInput value={v.amount} onChange={set("amount")} /></label>
        <label><span className="label">{c.credit}</span><MoneyInput value={v.credit} onChange={set("credit")} /></label>
        <label className="sm:col-span-2"><span className="label">{c.notes}</span><textarea className="input" rows={2} value={v.notes} onChange={set("notes")} placeholder={c.notesPlaceholder} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>{t.common.cancel}</button>
        <button type="button" className="btn-primary" disabled={pending || (!auto && !v.subject.trim())} onClick={() => onSave(v)}><Icon name="check" className="h-4 w-4" /> {t.common.save}</button>
        {onDelete && <button type="button" className="btn-ghost ml-auto text-red-600" onClick={onDelete}><Icon name="trash" className="h-4 w-4" /> {t.common.delete}</button>}
      </div>
    </div>
  );
}
