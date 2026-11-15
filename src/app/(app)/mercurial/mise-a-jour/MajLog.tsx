"use client";
import { useState, useTransition } from "react";
import { updateMajClaimAction } from "@/lib/actions/maj";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

interface Row { id: number; date: string | null; nature: string | null; item: string | null; original: string | null; detail: string | null; supplier: string | null; supplierId: number | null; reference: string | null; claim: string | null }

/** Historique « Suivi MAJ » repris du fichier Excel, mêmes colonnes, filtres d'en-tête */
export function MajLog({ rows, editable }: { rows: Row[]; editable: boolean }) {
  const { t, locale } = useI18n();
  const m = t.maj;
  const cols: Col<Row>[] = [
    { key: "date", label: m.date, text: (r) => (r.date ? fmtDate(r.date, locale) : ""), sort: (r) => r.date, className: "whitespace-nowrap" },
    { key: "nature", label: m.nature, text: (r) => r.nature ?? "" },
    { key: "item", label: m.item, text: (r) => r.item ?? "", render: (r) => <>{r.item || "—"}{r.original && <span className="block text-[11px] text-stone-400" title={m.original}>{r.original}</span>}</> },
    { key: "detail", label: m.detail, text: (r) => r.detail ?? "", className: "whitespace-pre-wrap" },
    { key: "supplier", label: m.supplier, text: (r) => r.supplier ?? "", href: (r) => (r.supplierId ? `/mercurial/fournisseurs/${r.supplierId}` : null) },
    { key: "reference", label: m.reference, text: (r) => r.reference ?? "", className: "whitespace-pre-wrap text-stone-600" },
    { key: "claim", label: m.claim, text: (r) => r.claim ?? "", className: "min-w-56", render: (r) => (editable ? <Claim id={r.id} initial={r.claim ?? ""} /> : r.claim || "—") },
  ];
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{m.title}</h1>
        <a className="btn-secondary py-2" href="/api/export/maj">{t.common.exportCsv}</a>
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} />
    </section>
  );
}

function Claim({ id, initial }: { id: number; initial: string }) {
  const [v, setV] = useState(initial);
  const [, start] = useTransition();
  return <input className="input py-1.5 text-sm" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== initial && start(() => updateMajClaimAction(id, v))} />;
}
