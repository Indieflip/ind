"use client";
import { dayOf } from "@/lib/numbering";
import { useRef, useState } from "react";
import { saveClaimAction } from "@/lib/actions/prices";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";

/** Réclamation : enregistrée dès qu'on quitte le champ */
export function ClaimCell({ id, initial, placeholder }: { id: number; initial: string; placeholder: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const last = useRef(initial);
  return (
    <div className="relative">
      <textarea
        rows={1}
        className="input min-h-9 resize-y py-1.5 text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={async () => {
          if (value === last.current) return;
          setState("saving");
          await saveClaimAction(id, value);
          last.current = value;
          setState("saved");
          setTimeout(() => setState("idle"), 1500);
        }}
      />
      {state !== "idle" && <span className="absolute right-2 top-2 text-xs text-emerald-600">{state === "saving" ? "…" : <Icon name="check" className="h-4 w-4" />}</span>}
    </div>
  );
}

export interface PriceRow {
  id: number; number: number | null; date: string; dateSort: string; supplier: string; supplierId: number | null; product: string; unit: string;
  document: string; documentHref: string | null; origin: string;
  old: string; oldN: number | null; new: string; newN: number | null; diff: string; type: string; typeLabel: string;
  pct: number | null; pctLabel: string; claim: string;
}

/** Suivi des prix : lignes générées automatiquement (réceptions, historique du Mercurial, corrections) */
export function PricesTable({ rows, editable }: { rows: PriceRow[]; editable: boolean }) {
  const { t } = useI18n();
  const pr = t.prices;
  const cols: Col<PriceRow>[] = [
    { key: "number", label: "N°", text: (r) => (r.number ? String(r.number) : ""), sort: (r) => r.number, width: "5%", className: "tabular-nums text-stone-500" },
    { key: "date", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateSort, date: (r) => dayOf(r.dateSort), className: "whitespace-nowrap", width: "8%" },
    { key: "supplier", label: t.common.supplier, text: (r) => r.supplier || "—", href: (r) => (r.supplierId ? `/mercurial/fournisseurs/${r.supplierId}` : null), width: "12%" },
    { key: "product", label: t.common.product, keepCase: true, text: (r) => r.product, render: (r) => <>{r.product}{r.unit && <span className="text-xs text-stone-400"> / {r.unit}</span>}</>, width: "19%" },
    {
      key: "document", label: pr.document, keepCase: true, text: (r) => r.document, width: "13%",
      render: (r) => (
        <>
          {r.documentHref ? <a className="text-brand-700 underline" href={r.documentHref}>{r.document || "—"}</a> : r.document || "—"}
          <span className="block text-[11px] text-stone-400">{r.origin}</span>
        </>
      ),
    },
    {
      key: "variation", label: pr.variation, align: "right", text: (r) => r.typeLabel, sort: (r) => r.pct, options: [pr.types.increase, pr.types.decrease], width: "10%",
      render: (r) => (
        <span className={`inline-flex flex-col items-end font-semibold tabular-nums ${r.type === "increase" ? "text-red-600" : "text-emerald-700"}`}>
          <span>{r.type === "increase" ? "▲" : "▼"} {r.pctLabel}</span>
          <span className="text-[11px] font-normal">{r.diff}</span>
        </span>
      ),
    },
    {
      key: "price", label: pr.price, align: "right", text: (r) => `${r.old} → ${r.new}`, sort: (r) => r.newN, width: "13%",
      render: (r) => <span className="whitespace-nowrap tabular-nums"><span className="text-stone-400 line-through decoration-stone-300">{r.old}</span> → <strong>{r.new}</strong></span>,
    },
    {
      key: "claim", label: pr.claim, text: (r) => r.claim, width: "20%",
      render: (r) => (editable ? <ClaimCell id={r.id} initial={r.claim} placeholder={`${pr.claim}…`} /> : <span className="text-sm">{r.claim || "—"}</span>),
    },
  ];
  return <DataTable fixed rows={rows} cols={cols} rowKey={(r) => r.id} empty={pr.empty} defaultSort={{ key: "number", dir: "desc" }} />;
}
