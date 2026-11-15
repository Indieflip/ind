"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addWeighGapAction, updateWeighGapAction, type WeighGapInput } from "@/lib/actions/anomalies";
import { PasteRowButton } from "@/components/table/RowMenu";
import { copyRow, type RowFields } from "@/lib/client/rowClipboard";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface WeighRow {
  id: number; date: string; dateIso: string; nature: string; supplier: string; supplierId: number | null; reference: string;
  product: string; original: string | null; rawProduct: string;
  qtyInvoiced: number | null; unitPrice: number | null; qtyWeighed: number | null; loss: number | null;
  gapQty: number | null; gapAmount: number | null; detail: string; claimDate: string; receptionId: number | null;
}

const kg = (n: number | null) => (n == null ? "" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }));
const NATURES = ["Viande", "Poisson", "Fruits & Légumes", "Crèmerie", "Épicerie", "Boisson", "Boulangerie", "Autre"];

export function WeighTable({ rows, canEdit, suppliers }: { rows: WeighRow[]; canEdit: boolean; suppliers: { id: number; name: string }[] }) {
  const { t, locale } = useI18n();
  const w = t.weigh;
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [edit, setEdit] = useState<{ row: WeighRow | null; pre?: RowFields } | null>(null);
  const router = useRouter();
  const fieldsOf = (r: WeighRow): RowFields => ({
    date: r.dateIso, nature: r.nature, supplier: r.supplier, supplierId: r.supplierId ? String(r.supplierId) : "", reference: r.reference, product: r.product,
    qtyInvoiced: r.qtyInvoiced != null ? String(r.qtyInvoiced) : "", qtyWeighed: r.qtyWeighed != null ? String(r.qtyWeighed) : "", unitPrice: r.unitPrice != null ? String(r.unitPrice) : "",
    amount: r.gapAmount != null ? String(r.gapAmount) : "", unit: "Kg",
    description: `${w.gapQty} ${kg(r.gapQty)} kg${r.gapAmount != null ? ` (${fmtMoney(r.gapAmount, locale)})` : ""} — ${r.product}`,
    detail: r.detail, receptionId: r.receptionId ? String(r.receptionId) : "", weighGapId: String(r.id),
  });
  const picked = rows.filter((r) => sel.has(r.id));
  const total = (picked.length ? picked : rows).reduce((s, r) => s + (r.gapAmount ?? 0), 0);
  const signed = (n: number | null) => (n == null ? "" : n < 0 ? <span className="text-sky-700">{kg(n)}</span> : kg(n));
  const cols: Col<WeighRow>[] = [
    { key: "date", width: "4.75rem", label: w.date, text: (r) => r.date, sort: (r) => r.dateIso },
    { key: "nature", width: "4.5rem", label: w.nature, text: (r) => r.nature },
    { key: "supplier", width: "7%", label: t.common.supplier, text: (r) => r.supplier, render: (r) => (r.supplierId ? <Link href={`/mercurial/fournisseurs/${r.supplierId}`} className="text-brand-700 hover:underline">{r.supplier}</Link> : r.supplier || "—") },
    { key: "reference", width: "7%", label: t.anomalies.blInvoice, text: (r) => r.reference, render: (r) => (r.receptionId ? <Link href={`/receptions/${r.receptionId}`} className="text-brand-700 hover:underline">{r.reference || "—"}</Link> : r.reference || "—") },
    { key: "product", width: "11%", label: t.common.product, text: (r) => r.product, render: (r) => <span title={r.original ? `${t.maj.original} : ${r.original}` : undefined}>{r.product}</span> },
    { key: "qtyInvoiced", width: "3.75rem", label: w.qtyInvoiced, align: "right", text: (r) => kg(r.qtyInvoiced), sort: (r) => r.qtyInvoiced, filterable: false },
    { key: "unitPrice", width: "3.9rem", label: w.unitPrice, align: "right", text: (r) => (r.unitPrice != null ? fmtMoney(r.unitPrice, locale) : ""), sort: (r) => r.unitPrice, filterable: false },
    { key: "qtyWeighed", width: "3.6rem", label: w.qtyWeighed, align: "right", text: (r) => kg(r.qtyWeighed), sort: (r) => r.qtyWeighed, filterable: false },
    { key: "loss", width: "4.1rem", label: w.loss, align: "right", text: (r) => kg(r.loss), sort: (r) => r.loss, filterable: false },
    { key: "gapQty", width: "3.6rem", label: w.gapQty, align: "right", text: (r) => kg(r.gapQty), sort: (r) => r.gapQty, filterable: false, render: (r) => signed(r.gapQty) },
    { key: "gapAmount", width: "3.9rem", label: w.gapAmount, align: "right", text: (r) => (r.gapAmount != null ? fmtMoney(r.gapAmount, locale) : ""), sort: (r) => r.gapAmount, filterable: false, className: "font-semibold" },
    { key: "detail", label: w.detail, text: (r) => r.detail, className: "whitespace-pre-line" },
    { key: "claim", width: "4.75rem", label: w.claim, text: (r) => (r.claimDate ? fmtDate(r.claimDate, locale) : ""), sort: (r) => r.claimDate },
    ...(canEdit
      ? [{ key: "edit", width: "2rem", label: "", text: () => "", sortable: false, filterable: false, render: (r: WeighRow) => <button type="button" className="btn-ghost p-1.5" title={t.common.edit} onClick={() => setEdit({ row: r })}><Icon name="edit" className="h-4 w-4" /></button> } as Col<WeighRow>]
      : []),
  ];
  return (
    <>
      {canEdit && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary py-1.5" onClick={() => setEdit({ row: null })}><Icon name="plus" className="h-4 w-4" /> {w.add}</button>
          <PasteRowButton onPaste={(f) => setEdit({ row: null, pre: f })} />
        </div>
      )}
      <div className="mb-2 text-sm text-stone-700">
        {w.total}{picked.length ? ` (${picked.length})` : ""} : <strong>{fmtMoney(total, locale)}</strong>
        <span className="ml-3 text-xs text-stone-500">{w.signHint}</span>
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} selectable selection={sel} onSelectionChange={setSel} defaultSort={{ key: "date", dir: "desc" }} dense fixed
        copy={{ source: w.title, fields: fieldsOf, actions: (r) => [{ label: `⚑ ${t.claims.create}`, onClick: () => { copyRow(w.title, fieldsOf(r)); router.push("/anomalies/reclamations?from=row"); } }] }}
      />
      {edit && <WeighEditor row={edit.row} pre={edit.pre} suppliers={suppliers} onClose={() => setEdit(null)} />}
    </>
  );
}

function WeighEditor({ row, pre = {}, suppliers, onClose }: { row: WeighRow | null; pre?: RowFields; suppliers: { id: number; name: string }[]; onClose: () => void }) {
  const { t } = useI18n();
  const w = t.weigh;
  const router = useRouter();
  const s = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  const preSupplier = pre.supplierId ? pre.supplierId : suppliers.find((x) => x.name.toLowerCase() === (pre.supplier ?? "").toLowerCase())?.id.toString() ?? "";
  const dec = (x?: string) => (x ?? "").replace(".", ",");
  const [v, setV] = useState(
    row
      ? {
          date: row.dateIso, nature: row.nature, supplierId: row.supplierId ? String(row.supplierId) : "", reference: row.reference, product: row.rawProduct,
          qtyInvoiced: s(row.qtyInvoiced), unitPrice: s(row.unitPrice), qtyWeighed: s(row.qtyWeighed), acceptableLoss: s(row.loss), detail: row.detail, claimDate: row.claimDate,
        }
      : {
          date: pre.date && /^\d{4}-\d{2}-\d{2}$/.test(pre.date) ? pre.date : new Date().toISOString().slice(0, 10), nature: pre.nature ?? "", supplierId: preSupplier,
          reference: pre.reference ?? "", product: pre.product ?? "", qtyInvoiced: dec(pre.qtyInvoiced), unitPrice: dec(pre.unitPrice), qtyWeighed: dec(pre.qtyWeighed),
          acceptableLoss: "", detail: pre.detail ?? pre.description ?? "", claimDate: "",
        },
  );
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const n = (x: string) => (x.trim() ? Number(x.replace(",", ".")) : null);
  const gap = n(v.qtyInvoiced) != null && n(v.qtyWeighed) != null ? Math.round((n(v.qtyInvoiced)! - n(v.qtyWeighed)! - (n(v.acceptableLoss) ?? 0)) * 1000) / 1000 : null;
  const input = (k: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label><span className="label">{label}</span><input className="input" value={v[k]} onChange={set(k)} {...props} /></label>
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="font-semibold">{row ? w.editTitle : w.add}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t.common.close}><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("date", w.date, { type: "date" })}
          <label><span className="label">{w.nature}</span><input className="input" list="weigh-natures" value={v.nature} onChange={set("nature")} /></label>
          <datalist id="weigh-natures">{NATURES.map((x) => <option key={x} value={x} />)}</datalist>
          <label>
            <span className="label">{t.common.supplier}</span>
            <select className="input" value={v.supplierId} onChange={set("supplierId")}>
              <option value="">—</option>
              {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          {input("reference", t.anomalies.blInvoice)}
          <div className="sm:col-span-2">{input("product", t.common.product)}</div>
          {input("qtyInvoiced", w.qtyInvoiced, { inputMode: "decimal" })}
          <label><span className="label">{w.unitPrice}</span><MoneyInput value={v.unitPrice} onChange={set("unitPrice")} /></label>
          {input("qtyWeighed", w.qtyWeighed, { inputMode: "decimal" })}
          {input("acceptableLoss", w.loss, { inputMode: "decimal" })}
          <p className="text-sm text-stone-600 sm:col-span-2">{w.gapQty} : <strong>{gap == null ? "—" : gap.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}</strong>{gap != null && n(v.unitPrice) != null && <> · {w.gapAmount} : <strong>{(gap * n(v.unitPrice)!).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</strong></>}</p>
          <label className="sm:col-span-2"><span className="label">{w.detail}</span><textarea className="input" rows={2} value={v.detail} onChange={set("detail")} /></label>
          {input("claimDate", w.claim, { type: "date" })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t.common.cancel}</button>
          <button
            className="btn-primary"
            disabled={pending || !v.product.trim()}
            onClick={() => start(async () => {
              const data: WeighGapInput = { ...v, supplierId: v.supplierId ? Number(v.supplierId) : null };
              if (row) await updateWeighGapAction(row.id, data);
              else await addWeighGapAction(data);
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
