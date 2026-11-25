"use client";
import { dayOf } from "@/lib/numbering";
import { fmtNo } from "@/lib/numbering";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { groupClaimsAction, ungroupClaimAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { MoneyInput } from "@/components/MoneyInput";
import { waitingOf, stageStyles, type Stage, modeIcon } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney, sentence } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface ClaimViewRow {
  id: number; claimNo: number; year?: number; consolidated: boolean; date: string; dateIso: string; supplier: string; supplierId: number | null; reference: string; product: string; subject: string;
  mode: string; waitingFor?: string | null; lastActionAt?: string; lastActionLabel?: string; stage: Stage; resolution: string | null; claimed: number | null; credit: number | null; days: number; due: boolean; source: string;
}

/** Vignettes Réclamée / À vérifier sur facture / Clôturée / Annulée + tableau (clic → fiche d'anomalie) */
export function ClaimsView({ rows: allRows, canManage, initialFilter, claimNo = null, claimYear = null }: { rows: ClaimViewRow[]; canManage: boolean; initialFilter?: "missing"; claimNo?: number | null; claimYear?: number | null }) {
  // Numéro par année : la réclamation FDR… de l'année demandée (sinon toutes les années)
  const rows = claimNo ? allRows.filter((r) => r.claimNo === claimNo && (!claimYear || r.year === claimYear)) : allRows;
  const { t, locale } = useI18n();
  const c = t.claims;
  const tiles: Stage[] = ["cloturee", "annulee"];
  const [filter, setFilter] = useState<Stage | "open" | "missing" | "all">(initialFilter ?? "all");
  const isOpen = (r: ClaimViewRow) => r.stage === "en_attente" || r.stage === "a_traiter";
  const missing = rows.filter((r) => isOpen(r) && r.claimed == null);
  const counts = Object.fromEntries(tiles.map((s) => [s, rows.filter((r) => r.stage === s).length])) as Record<Stage, number>;
  const shown = filter === "all" ? rows : filter === "open" ? rows.filter((r) => r.stage === "en_attente") : filter === "missing" ? missing : rows.filter((r) => r.stage === filter);
  const sum = (k: "claimed" | "credit") => shown.reduce((s, r) => s + (r[k] ?? 0), 0);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [busy, startBusy] = useTransition();
  const router2 = useRouter();
  const groupSize = new Map<number, number>();
  for (const r of rows) groupSize.set(r.claimNo, (groupSize.get(r.claimNo) ?? 0) + 1);
  const cols: Col<ClaimViewRow>[] = [
    // N° de réclamation : seul lien vers la fiche d'anomalie / l'écart de pesée
    {
      key: "claimNo", width: "5rem", label: "N°", text: (r) => fmtNo("claim", r.claimNo), sort: (r) => r.claimNo,
      render: (r) => (
        <div>
          <Link href={`/anomalies/${r.id}`} className="font-semibold text-brand-700 hover:underline" title={t.sheet.open}>{fmtNo("claim", r.claimNo)}</Link>
          {(groupSize.get(r.claimNo) ?? 0) > 1 && (
            <span className="block text-[10px] text-stone-500">
              {c.grouped}
            </span>
          )}
        </div>
      ),
    },
    { key: "date", width: "5rem", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateIso, date: (r) => dayOf(r.dateIso) },
    { key: "supplier", width: "10%", label: t.common.supplier, text: (r) => r.supplier, render: (r) => sentence(r.supplier) },
    { key: "reference", width: "9%", label: t.anomalies.blInvoice, text: (r) => r.reference },
    { key: "mode", width: "6.5rem", label: c.mode, text: (r) => t.modes[r.mode as "reclamation"], options: Object.values(t.modes), render: (r) => <span className="text-xs">{modeIcon(r.mode)} {t.modes[r.mode as "reclamation"]}</span> },
    {
      key: "claimed", width: "6rem", label: c.amount, align: "right", text: (r) => (r.claimed != null ? fmtMoney(r.claimed, locale) : ""), sort: (r) => r.claimed, range: (r) => r.claimed,
      // Montant manquant : saisie directe dans la ligne
      render: (r) => (canManage && r.claimed == null && isOpen(r) ? <AmountCell id={r.id} /> : r.claimed != null ? fmtMoney(r.claimed, locale) : "—"),
    },
    { key: "lastAction", width: "6rem", label: c.lastAction, text: (r) => r.lastActionLabel ?? "", sort: (r) => r.lastActionAt ?? "", date: (r) => r.lastActionAt ?? null, className: "whitespace-nowrap" },
    {
      key: "stage", width: "8rem", label: t.common.status, text: (r) => t.stages[r.stage], options: Object.values(t.stages),
      render: (r) => (
        <div className="space-y-0.5">
          <span className={`badge ${stageStyles[r.stage]}`}>{t.stages[r.stage]}</span>
          {r.stage === "en_attente" && waitingOf(r.waitingFor) && <div className="text-[11px] font-medium text-amber-800">{t.waiting[waitingOf(r.waitingFor)!]}</div>}
          {r.stage === "cloturee" && r.resolution && <div className="text-[11px] text-emerald-800">{t.resolutions[r.resolution as "avoir"]}</div>}
          {r.stage === "en_attente" && <div className={`text-[11px] ${r.due ? "font-semibold text-red-700" : "text-stone-500"}`}>{r.days} {t.kanban.days}</div>}
        </div>
      ),
    },
  ];
  // Ordre : Date, N°, Fournisseur, BL / Facture, Montant, Suivi, Dernière action, Statut
  const ORDER = ["date", "claimNo", "supplier", "reference", "claimed", "mode", "lastAction", "stage"];
  cols.sort((x, y) => (ORDER.indexOf(x.key) + 1 || 99) - (ORDER.indexOf(y.key) + 1 || 99));
  return (
    <>
      {claimNo && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <strong>{fmtNo("claim", claimNo)}</strong> · {rows.length} {t.anomalies.sheetsLabel}
          <Link href="/anomalies/reclamations" className="ml-auto text-brand-700 underline">✕ {c.all}</Link>
        </p>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <button type="button" onClick={() => setFilter("all")} className={`rounded-xl border bg-brand-700 p-3 text-left text-white ${filter === "all" ? "border-red-500" : "border-transparent opacity-90 hover:opacity-100"}`}>
          <p className="text-2xl font-bold leading-none">{rows.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/80">{c.all}</p>
        </button>
        <button type="button" onClick={() => setFilter("open")} className={`rounded-xl border bg-white p-3 text-left ${filter === "open" ? "border-red-500" : "border-stone-200"}`}>
          <p className="text-2xl font-bold leading-none">{counts.en_attente}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{t.stages.en_attente}</p>
        </button>
        <button type="button" onClick={() => setFilter(filter === "missing" ? "all" : "missing")} className={`rounded-xl border bg-white p-3 text-left ${filter === "missing" ? "border-red-500" : "border-stone-200"}`}>
          <p className="text-2xl font-bold leading-none text-red-700">{missing.length}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.missingAmount}</p>
        </button>
        {tiles.map((s) => (
          <button key={s} type="button" onClick={() => setFilter(filter === s ? "all" : s)} className={`rounded-xl border p-3 text-left transition ${stageStyles[s]} ${filter === s ? "border-red-500" : "border-transparent opacity-80 hover:opacity-100"}`}>
            <p className="text-2xl font-bold leading-none">{counts[s]}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{t.stages[s]}</p>
          </button>
        ))}
      </div>
      <p className="mb-2 text-right text-sm text-stone-600">{c.amount} : <strong>{fmtMoney(sum("claimed"), locale)}</strong></p>
      <DataTable
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
