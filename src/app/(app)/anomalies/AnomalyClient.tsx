"use client";
import { dayOf } from "@/lib/numbering";
import { DateField } from "@/components/DateField";
import { fmtNo } from "@/lib/numbering";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createAnomalyAction, setAnomaliesReviewAction, setAnomalyReviewAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate, fmtMoney, sentence } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { StatusBadge } from "@/components/DecisionBadge";
import { appConfirm } from "@/components/Confirm";
import { DataTable, type Col } from "@/components/table/DataTable";
import { PhotoButton, Thumbs } from "@/components/reception/PhotoButton";
import { PasteRowButton } from "@/components/table/RowMenu";
import { isOpenStage, outcomeOf, outcomeStyles, stageOf, stageStyles } from "@/lib/anomaly";
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
        <label><span className="label">{t.anomalies.nextAction}</span><DateField name="nextActionAt" /></label>
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
  type: string; nextActionAt: string; due: boolean; verify?: "a_traiter" | "a_verifier" | null; receptionId: number | null; photoUrl: string | null; consolidated?: string;
  stage: string; resolution: string | null; mode: string; claimed: number | null; days: number; delay: number; closedAt: string | null;
  review?: string;
  problemType?: string;
  missing?: string[];
}

/** Anomalies : à suivre aujourd'hui, suivi (colonnes du fichier), consolidation */
export function AnomaliesBoard({ rows, consolidated, canManage, canConsolidate, today }: { rows: AnomalyRow[]; consolidated: AnomalyRow[]; canManage: boolean; canConsolidate: boolean; today: string }) {
  const { t, locale } = useI18n();
  const a = t.anomalies;
  const router = useRouter();
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [pending, start] = useTransition();
  // Menu ⋮ : copier la ligne (à coller dans un autre tableau) ou en faire une réclamation
  const fieldsOf = (r: AnomalyRow): RowFields => ({
    date: r.dateSort.slice(0, 10), nature: r.nature, supplier: r.supplier, supplierId: r.supplierId ? String(r.supplierId) : "", reference: r.reference,
    product: r.product, description: r.problem, action: r.action, result: a.outcomes[outcomeOf(r.result)], amount: r.saving != null ? String(r.saving) : "",
    receptionId: r.receptionId ? String(r.receptionId) : "", anomalyId: String(r.id),
  });
  const copySpec = {
    source: a.title,
    fields: fieldsOf,
    actions: (r: AnomalyRow) => [{ label: `🗂 ${t.sheet.open}`, onClick: () => router.push(`/anomalies/${r.id}`) }],
  };
  const totalSaving = [...rows, ...consolidated].reduce((s, r) => s + (r.saving ?? 0), 0);
  const cols: Col<AnomalyRow>[] = [
    {
      key: "number", width: "4rem", label: a.number, text: (r) => (r.number != null ? fmtNo("anomaly", r.number) : ""), sort: (r) => r.number, href: (r) => `/anomalies/${r.id}`,
      render: (r) => (r.number == null ? "—" : <strong>{fmtNo("anomaly", r.number)}</strong>),
    },
    { key: "date", width: "5.25rem", label: a.deliveryDate, text: (r) => r.date, sort: (r) => r.dateSort, date: (r) => dayOf(r.dateSort), className: "" },
    { key: "nature", width: "4.5rem", label: a.nature, text: (r) => r.nature },
    { key: "supplier", width: "7.5%", label: t.common.supplier, text: (r) => r.supplier, render: (r) => (r.supplierId ? <Link className="text-brand-700 hover:underline" href={`/mercurial/fournisseurs/${r.supplierId}`}>{sentence(r.supplier)}</Link> : sentence(r.supplier)) },
    { key: "reference", width: "7%", label: a.blInvoice, text: (r) => r.reference, render: (r) => (r.receptionId ? <Link className="text-brand-700 hover:underline" href={`/receptions/${r.receptionId}`}>{r.reference || "—"}</Link> : r.reference || "—") },
    { key: "product", width: "8.5%", label: t.common.product, text: (r) => r.product },
    { key: "problem", label: a.problem, text: (r) => r.problem, className: "whitespace-pre-wrap", keepCase: true, render: (r) => <Link href={`/anomalies/${r.id}`} className="hover:text-brand-700 hover:underline" title={t.sheet.open}>{r.problem}</Link> },
    { key: "action", label: a.action, text: (r) => r.action, className: "whitespace-pre-wrap" },
    { key: "lastActionAt", width: "4.75rem", label: a.lastAction, text: (r) => (r.lastActionAt ? fmtDate(r.lastActionAt, locale) : ""), sort: (r) => r.lastActionAt, className: "whitespace-nowrap" },
    { key: "result", width: "6%", label: a.result, text: (r) => a.outcomes[outcomeOf(r.result)], options: Object.values(a.outcomes), render: (r) => <span className={`badge ${outcomeStyles[outcomeOf(r.result)]}`}>{a.outcomes[outcomeOf(r.result)]}</span> },
    { key: "saving", width: "4.75rem", label: a.saving, align: "right", text: (r) => (r.saving != null ? fmtMoney(r.saving, locale) : ""), sort: (r) => r.saving, filterable: false },
    {
      key: "status", width: "5.25rem", label: t.common.status, text: (r) => r.statusLabel,
      render: (r) => (
        <div className="space-y-1">
          <StatusBadge status={r.status} label={r.statusLabel} />
          
        </div>
      ),
    },
    ...(canManage
      ? [{ key: "edit", width: "2rem", label: "", text: () => "", sortable: false, filterable: false, render: (r: AnomalyRow) => <Link className="btn-ghost p-1.5" title={t.sheet.open} href={`/anomalies/${r.id}`}><Icon name="edit" className="h-4 w-4" /></Link> } as Col<AnomalyRow>]
      : []),
  ];

  // Problème, Action, Dernière action, Résultat, Économie HT et Statut sont dans la fiche d'anomalie (clic sur la ligne)
  const shownCols = cols
    .filter((c) => !["problem", "action", "lastActionAt", "result", "saving", "status"].includes(c.key))
    .map((c) => (c.key === "product" ? { ...c, width: undefined, render: (r: AnomalyRow) => <Link href={`/anomalies/${r.id}`} className="font-medium text-brand-700 hover:underline" title={t.sheet.open}>{r.product || r.problem}</Link> } : c));
  // Suivi unique : l'étape (et les jours depuis la dernière action)
  const edit = shownCols.findIndex((c) => c.key === "edit");
  shownCols.splice(edit < 0 ? shownCols.length : edit, 0, {
    key: "stage", width: "8.5rem", label: t.common.status, text: (r) => t.stages[stageOf(r.stage)], options: Object.values(t.stages),
    render: (r) => (
      <div className="space-y-0.5">
        <span className={`badge ${stageStyles[stageOf(r.stage)]}`}>{t.stages[stageOf(r.stage)]}</span>
        {isOpenStage(stageOf(r.stage)) && <div className={`text-[11px] ${r.due ? "font-semibold text-red-700" : "text-stone-500"}`}>{r.days} {t.kanban.days}</div>}
      </div>
    ),
  });
  // Contrôle de la fiche (À vérifier / Vérifiée / À voir), modifiable dans la liste
  const reviewLabel = (v?: string) => (v ? t.sheet.reviews[v as "a_verifier"] ?? "" : "");
  // Type d'anomalie : pour traiter les fiches type par type (filtre et tri en en-tête)
  // À compléter : les champs non remplis de chaque fiche (filtrable : ex. « N° d'avoir »)
  shownCols.push({
    key: "missing", width: "9rem", label: a.toComplete, text: (r) => (r.missing ?? []).join(", "), keepCase: true,
    options: Object.values(a.missingFields), sort: (r) => r.missing?.length ?? 0,
    render: (r) => (r.missing?.length ? <span className="text-xs text-amber-800">{r.missing.join(", ")}</span> : <span className="text-xs text-emerald-700">✓</span>),
  });
  shownCols.splice(1, 0, { key: "problemType", width: "8rem", label: t.sheet.problemType, text: (r) => r.problemType ?? "", options: [...new Set(rows.map((r) => r.problemType ?? "").filter(Boolean))].sort((x, y) => x.localeCompare(y, "fr")), keepCase: true });
  shownCols.splice(1, 0, {
    key: "review", width: "6.5rem", label: t.sheet.reviewLabel, text: (r) => reviewLabel(r.review), options: Object.values(t.sheet.reviews),
    render: (r) => <ReviewSelect id={r.id} value={r.review ?? ""} disabled={!canManage} />,
  });
  return (
    <>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">

        {canManage && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-stone-500">{t.sheet.reviewLabel}{sel.size > 0 ? ` (${sel.size})` : ""} :</span>
            {(["a_verifier", "verifiee", "a_voir"] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={!sel.size || pending}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${REVIEW_STYLE[k]}`}
                onClick={() => start(async () => { await setAnomaliesReviewAction([...sel].map(Number), k); setSel(new Set()); router.refresh(); })}
              >
                {t.sheet.reviews[k]}
              </button>
            ))}
          </span>
        )}
        <span className="text-stone-500">{rows.length} {a.openCount} · {a.saving} : {fmtMoney(totalSaving, locale)}</span>
      </div>
      <DataTable copy={copySpec} rows={rows} cols={shownCols} rowKey={(r) => r.id} empty={a.empty} selectable={canManage} selection={sel} onSelectionChange={setSel} defaultSort={{ key: "date", dir: "desc" }} dense fixed rowClassName={(r) => (r.due ? "bg-red-50/60" : "")} />



    </>
  );
}

const REVIEW_STYLE: Record<string, string> = { a_verifier: "border-amber-300 bg-amber-50 text-amber-900", verifiee: "border-emerald-300 bg-emerald-50 text-emerald-800", a_voir: "border-sky-300 bg-sky-50 text-sky-900" };

/** Contrôle d'une fiche depuis la liste */
function ReviewSelect({ id, value, disabled }: { id: number; value: string; disabled?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const [, start] = useTransition();
  return (
    <select
      aria-label={t.sheet.reviewLabel}
      disabled={disabled}
      value={v}
      onChange={(e) => { const next = e.target.value; setV(next); start(async () => { await setAnomalyReviewAction(id, next); router.refresh(); }); }}
      className={`w-full rounded-md border px-1 py-1 text-xs ${REVIEW_STYLE[v] ?? "border-stone-200 bg-white text-stone-500"}`}
    >
      <option value="">—</option>
      {(["a_verifier", "verifiee", "a_voir"] as const).map((k) => <option key={k} value={k}>{t.sheet.reviews[k]}</option>)}
    </select>
  );
}
