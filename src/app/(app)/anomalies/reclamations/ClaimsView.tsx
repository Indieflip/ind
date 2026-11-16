"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { groupClaimsAction, ungroupClaimAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { MoneyInput } from "@/components/MoneyInput";
import { stageStyles, type Stage, modeIcon } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney, sentence } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface ClaimViewRow {
  id: number; claimNo: number; consolidated: boolean; date: string; dateIso: string; supplier: string; supplierId: number | null; reference: string; product: string; subject: string;
  mode: string; stage: Stage; resolution: string | null; claimed: number | null; credit: number | null; days: number; due: boolean; source: string;
}

/** Vignettes Réclamée / À vérifier sur facture / Clôturée / Annulée + tableau (clic → fiche d'anomalie) */
export function ClaimsView({ rows, canManage, initialFilter }: { rows: ClaimViewRow[]; canManage: boolean; initialFilter?: "missing" }) {
  const { t, locale } = useI18n();
  const c = t.claims;
  const tiles: Stage[] = ["reclamee", "a_verifier", "cloturee", "annulee"];
  const [filter, setFilter] = useState<Stage | "open" | "missing">(initialFilter ?? "open");
  const isOpen = (r: ClaimViewRow) => r.stage === "reclamee" || r.stage === "a_verifier" || r.stage === "a_traiter";
  const missing = rows.filter((r) => isOpen(r) && r.claimed == null);
  const counts = Object.fromEntries(tiles.map((s) => [s, rows.filter((r) => r.stage === s).length])) as Record<Stage, number>;
  const shown = filter === "open" ? rows.filter((r) => r.stage === "reclamee" || r.stage === "a_verifier") : filter === "missing" ? missing : rows.filter((r) => r.stage === filter);
  const sum = (k: "claimed" | "credit") => shown.reduce((s, r) => s + (r[k] ?? 0), 0);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [busy, startBusy] = useTransition();
  const router2 = useRouter();
  const groupSize = new Map<number, number>();
  for (const r of rows) groupSize.set(r.claimNo, (groupSize.get(r.claimNo) ?? 0) + 1);
  const cols: Col<ClaimViewRow>[] = [
    // N° de réclamation : seul lien vers la fiche d'anomalie / l'écart de pesée
    {
      key: "claimNo", width: "4.5rem", label: "N°", text: (r) => String(r.claimNo), sort: (r) => r.claimNo,
      render: (r) => (
        <div>
          <Link href={`/anomalies/${r.id}`} className="font-semibold text-brand-700 hover:underline" title={t.sheet.open}>{r.claimNo}</Link>
          {(groupSize.get(r.claimNo) ?? 0) > 1 && (
            <span className="block text-[10px] text-stone-500">
              {c.grouped}{canManage && !r.consolidated && <button type="button" className="ml-1 underline" onClick={() => startBusy(async () => { await ungroupClaimAction(r.id); router2.refresh(); })}>{c.ungroup}</button>}
            </span>
          )}
        </div>
      ),
    },
    { key: "date", width: "5rem", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateIso },
    { key: "supplier", width: "10%", label: t.common.supplier, text: (r) => r.supplier, render: (r) => sentence(r.supplier) },
    { key: "reference", width: "9%", label: t.anomalies.blInvoice, text: (r) => r.reference },
    { key: "product", width: "11%", label: t.common.product, text: (r) => r.product },
    { key: "subject", label: c.subject, text: (r) => r.subject, keepCase: true, className: "text-stone-700" },
    { key: "mode", width: "6.5rem", label: c.mode, text: (r) => t.modes[r.mode as "reclamation"], options: Object.values(t.modes), render: (r) => <span className="text-xs">{modeIcon(r.mode)} {t.modes[r.mode as "reclamation"]}</span> },
    {
      key: "claimed", width: "6rem", label: c.amount, align: "right", text: (r) => (r.claimed != null ? fmtMoney(r.claimed, locale) : ""), sort: (r) => r.claimed, filterable: false,
      // Montant manquant : saisie directe dans la ligne
      render: (r) => (canManage && r.claimed == null && isOpen(r) ? <AmountCell id={r.id} /> : r.claimed != null ? fmtMoney(r.claimed, locale) : "—"),
    },
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
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <button type="button" onClick={() => setFilter("open")} className={`rounded-xl border-2 bg-white p-3 text-left ${filter === "open" ? "border-brand-600" : "border-stone-200"}`}>
          <p className="text-2xl font-bold leading-none">{counts.reclamee + counts.a_verifier}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.inProgress}</p>
        </button>
        <button type="button" onClick={() => setFilter(filter === "missing" ? "open" : "missing")} className={`rounded-xl border-2 bg-white p-3 text-left ${filter === "missing" ? "border-red-500" : "border-stone-200"}`}>
          <p className="text-2xl font-bold leading-none text-red-700">{missing.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.missingAmount}</p>
        </button>
        {tiles.map((s) => (
          <button key={s} type="button" onClick={() => setFilter(filter === s ? "open" : s)} className={`rounded-xl border-2 p-3 text-left transition ${stageStyles[s]} ${filter === s ? "border-current" : "border-transparent opacity-80 hover:opacity-100"}`}>
            <p className="text-2xl font-bold leading-none">{counts[s]}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t.stages[s]}</p>
          </button>
        ))}
      </div>
      <p className="mb-2 text-right text-sm text-stone-600">{c.amount} : <strong>{fmtMoney(sum("claimed"), locale)}</strong> · {c.credit} : <strong>{fmtMoney(sum("credit"), locale)}</strong></p>
      {canManage && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="btn-secondary py-1.5" disabled={sel.size < 2 || busy} onClick={() => startBusy(async () => { await groupClaimsAction([...sel].map(Number)); setSel(new Set()); router2.refresh(); })}>
            {c.group} {sel.size > 1 && `(${sel.size})`}
          </button>
          <span className="text-xs text-stone-500">{c.groupHint}</span>
        </div>
      )}
      <DataTable
        selectable={canManage}
        selection={sel}
        onSelectionChange={setSel}
        rows={shown}
        cols={cols}
        rowKey={(r) => r.id}
        defaultSort={{ key: "claimNo", dir: "desc" }}
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

/** Montant réclamé saisi directement dans la ligne (enregistré à la sortie du champ) */
function AmountCell({ id }: { id: number }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  return (
    <MoneyInput
      className={`input px-1.5 py-1 text-right text-xs ${pending ? "opacity-50" : ""}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v.trim()) start(async () => { await updateAnomalyAction(id, { claimedAmount: v }); router.refresh(); }); }}
    />
  );
}
