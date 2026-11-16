"use client";
import Link from "next/link";
import { useState } from "react";
import { stageStyles, type Stage } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney, sentence } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface ClaimViewRow {
  id: number; date: string; dateIso: string; supplier: string; supplierId: number | null; reference: string; product: string; subject: string;
  mode: string; stage: Stage; resolution: string | null; claimed: number | null; credit: number | null; days: number; due: boolean; source: string;
}

/** Vignettes Réclamée / À vérifier sur facture / Clôturée / Annulée + tableau (clic → fiche d'anomalie) */
export function ClaimsView({ rows }: { rows: ClaimViewRow[] }) {
  const { t, locale } = useI18n();
  const c = t.claims;
  const tiles: Stage[] = ["reclamee", "a_verifier", "cloturee", "annulee"];
  const [filter, setFilter] = useState<Stage | "open">("open");
  const counts = Object.fromEntries(tiles.map((s) => [s, rows.filter((r) => r.stage === s).length])) as Record<Stage, number>;
  const shown = filter === "open" ? rows.filter((r) => r.stage === "reclamee" || r.stage === "a_verifier") : rows.filter((r) => r.stage === filter);
  const sum = (k: "claimed" | "credit") => shown.reduce((s, r) => s + (r[k] ?? 0), 0);
  const cols: Col<ClaimViewRow>[] = [
    { key: "date", width: "5rem", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateIso },
    { key: "supplier", width: "10%", label: t.common.supplier, text: (r) => r.supplier, render: (r) => sentence(r.supplier) },
    { key: "reference", width: "9%", label: t.anomalies.blInvoice, text: (r) => r.reference },
    { key: "product", width: "11%", label: t.common.product, text: (r) => r.product, href: (r) => `/anomalies/${r.id}` },
    { key: "subject", label: c.subject, text: (r) => r.subject, keepCase: true, className: "text-stone-700" },
    { key: "mode", width: "6.5rem", label: c.mode, text: (r) => t.modes[r.mode as "reclamation"], options: Object.values(t.modes), render: (r) => <span className="text-xs">{r.mode === "verification" ? "🔍" : "📞"} {t.modes[r.mode as "reclamation"]}</span> },
    { key: "claimed", width: "5rem", label: c.amount, align: "right", text: (r) => (r.claimed != null ? fmtMoney(r.claimed, locale) : ""), sort: (r) => r.claimed, filterable: false },
    { key: "credit", width: "5rem", label: c.credit, align: "right", text: (r) => (r.credit != null ? fmtMoney(r.credit, locale) : ""), sort: (r) => r.credit, filterable: false },
    {
      key: "stage", width: "8rem", label: t.common.status, text: (r) => t.stages[r.stage], options: Object.values(t.stages),
      render: (r) => (
        <div className="space-y-0.5">
          <span className={`badge ${stageStyles[r.stage]}`}>{t.stages[r.stage]}</span>
          {r.stage === "cloturee" && r.resolution && <div className="text-[11px] text-emerald-800">{t.resolutions[r.resolution as "avoir"]}</div>}
          {(r.stage === "reclamee" || r.stage === "a_verifier") && <div className={`text-[11px] ${r.due ? "font-semibold text-red-700" : "text-stone-500"}`}>{r.days} {t.kanban.days}</div>}
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button type="button" onClick={() => setFilter("open")} className={`rounded-xl border-2 bg-white p-3 text-left ${filter === "open" ? "border-brand-600" : "border-stone-200"}`}>
          <p className="text-2xl font-bold leading-none">{counts.reclamee + counts.a_verifier}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.inProgress}</p>
        </button>
        {tiles.map((s) => (
          <button key={s} type="button" onClick={() => setFilter(filter === s ? "open" : s)} className={`rounded-xl border-2 p-3 text-left transition ${stageStyles[s]} ${filter === s ? "border-current" : "border-transparent opacity-80 hover:opacity-100"}`}>
            <p className="text-2xl font-bold leading-none">{counts[s]}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t.stages[s]}</p>
          </button>
        ))}
      </div>
      <p className="mb-2 text-right text-sm text-stone-600">{c.amount} : <strong>{fmtMoney(sum("claimed"), locale)}</strong> · {c.credit} : <strong>{fmtMoney(sum("credit"), locale)}</strong></p>
      <DataTable
        rows={shown}
        cols={cols}
        rowKey={(r) => r.id}
        defaultSort={{ key: "date", dir: "desc" }}
        dense
        fixed
        empty={c.empty}
        rowClassName={(r) => (r.due ? "bg-red-50/60" : "")}
        copy={{ source: c.title, fields: (r) => ({ date: r.dateIso.slice(0, 10), supplier: r.supplier, supplierId: r.supplierId ? String(r.supplierId) : "", reference: r.reference, product: r.product, description: r.subject, amount: r.claimed != null ? String(r.claimed) : "", anomalyId: String(r.id) }) }}
      />
      <p className="mt-2 text-xs text-stone-500"><Link href="/anomalies" className="text-brand-700 underline">{t.kanban.board}</Link> · {c.viewHint}</p>
    </>
  );
}
