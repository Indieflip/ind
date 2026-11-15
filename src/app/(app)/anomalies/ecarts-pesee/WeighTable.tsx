"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { updateWeighGapAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate, fmtMoney } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface WeighRow {
  id: number; date: string; dateSort: string; nature: string; supplier: string; product: string;
  qtyInvoiced: number | null; unitPrice: number | null; qtyWeighed: number | null; loss: number | null;
  gapQty: number | null; gapAmount: number | null; detail: string; claimDate: string; receptionId: number | null;
}

const kg = (n: number | null) => (n == null ? "" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }));

export function WeighTable({ rows, canEdit }: { rows: WeighRow[]; canEdit: boolean }) {
  const { t, locale } = useI18n();
  const w = t.weigh;
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const picked = rows.filter((r) => sel.has(r.id));
  const total = (picked.length ? picked : rows).reduce((s, r) => s + (r.gapAmount ?? 0), 0);
  const cols: Col<WeighRow>[] = [
    { key: "date", width: "5rem", label: w.date, text: (r) => r.date, sort: (r) => r.dateSort },
    { key: "nature", width: "4.5rem", label: w.nature, text: (r) => r.nature },
    { key: "supplier", width: "9%", label: w.supplierRef, text: (r) => r.supplier, render: (r) => (r.receptionId ? <Link href={`/receptions/${r.receptionId}`} className="text-brand-700 hover:underline">{r.supplier}</Link> : r.supplier) },
    { key: "product", width: "10%", label: t.common.product, text: (r) => r.product },
    { key: "qtyInvoiced", width: "4.25rem", label: w.qtyInvoiced, align: "right", text: (r) => kg(r.qtyInvoiced), sort: (r) => r.qtyInvoiced, filterable: false },
    { key: "unitPrice", width: "4.25rem", label: w.unitPrice, align: "right", text: (r) => (r.unitPrice != null ? fmtMoney(r.unitPrice, locale) : ""), sort: (r) => r.unitPrice, filterable: false },
    { key: "qtyWeighed", width: "4.25rem", label: w.qtyWeighed, align: "right", text: (r) => kg(r.qtyWeighed), sort: (r) => r.qtyWeighed, filterable: false },
    { key: "loss", width: "4.25rem", label: w.loss, align: "right", text: (r) => kg(r.loss), sort: (r) => r.loss, filterable: false, render: (r) => (canEdit ? <Cell row={r} field="acceptableLoss" value={r.loss != null ? String(r.loss).replace(".", ",") : ""} className="text-right" /> : kg(r.loss)) },
    { key: "gapQty", width: "4.25rem", label: w.gapQty, align: "right", text: (r) => kg(r.gapQty), sort: (r) => r.gapQty, filterable: false },
    { key: "gapAmount", width: "4.25rem", label: w.gapAmount, align: "right", text: (r) => (r.gapAmount != null ? fmtMoney(r.gapAmount, locale) : ""), sort: (r) => r.gapAmount, filterable: false, className: "font-semibold" },
    { key: "detail", label: w.detail, text: (r) => r.detail, render: (r) => (canEdit ? <Cell row={r} field="detail" value={r.detail} multiline /> : r.detail) },
    { key: "claim", width: "6rem", label: w.claim, text: (r) => (r.claimDate ? fmtDate(r.claimDate, locale) : ""), sort: (r) => r.claimDate, render: (r) => (canEdit ? <Cell row={r} field="claimDate" value={r.claimDate} type="date" /> : r.claimDate ? fmtDate(r.claimDate, locale) : "") },
  ];
  return (
    <>
      <div className="mb-2 text-sm text-stone-700">
        {w.total}{picked.length ? ` (${picked.length})` : ""} : <strong>{fmtMoney(total, locale)}</strong>
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} selectable selection={sel} onSelectionChange={setSel} defaultSort={{ key: "date", dir: "desc" }} dense fixed />
    </>
  );
}

/** Champ éditable enregistré à la sortie du champ */
function Cell({ row, field, value, type = "text", className = "", multiline }: { row: WeighRow; field: "detail" | "claimDate" | "acceptableLoss"; value: string; type?: string; className?: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const save = () => { if (v !== value) start(async () => { await updateWeighGapAction(row.id, { [field]: v }); }); };
  if (multiline)
    return <textarea rows={Math.min(4, Math.max(1, v.split("\n").length))} className={`w-full min-w-0 resize-y rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-stone-300 focus:border-brand-500 focus:bg-white ${pending ? "opacity-50" : ""}`} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} />;
  return (
    <input
      type={type}
      inputMode={field === "acceptableLoss" ? "decimal" : undefined}
      className={`w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-stone-300 focus:border-brand-500 focus:bg-white ${pending ? "opacity-50" : ""} ${className}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
    />
  );
}
