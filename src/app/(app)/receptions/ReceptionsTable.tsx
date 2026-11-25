"use client";
import { fmtNo } from "@/lib/numbering";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteReceptionsAction } from "@/lib/actions/receptions";
import { useI18n } from "@/lib/i18n/client";
import { DataTable, type Col } from "@/components/table/DataTable";
import { StatusBadge } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { appConfirm } from "@/components/Confirm";

export interface ReceptionRow {
  id: number;
  number: number;
  blNumber: string | null;
  date: string; // affichage
  dateSort: string; // ISO
  day?: string; // AAAA-MM-JJ (heure de Paris), pour le filtre par calendrier
  supplierName: string;
  lineCount: number;
  /** Fiche générée à partir des anomalies importées : jamais consolidée automatiquement */
  imported?: boolean;
  anomalyCount?: number;
  status: string;
  statusLabel: string;
  consolidated: boolean;
  author: string | null;
  /** Brouillon (réception pas encore enregistrée) : id négatif, lien pour la reprendre */
  draftId?: number;
}

export function ReceptionsTable({ rows, canDelete, canEdit = false }: { rows: ReceptionRow[]; canDelete: boolean; canEdit?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [pending, start] = useTransition();
  const stateLabel = (r: ReceptionRow) => (r.draftId ? "—" : r.consolidated ? t.receptions.consolidated : r.imported ? t.receptions.importedState : t.receptions.toConsolidate);
  const href = (r: ReceptionRow) => (r.draftId ? `/receptions/new?draft=${r.draftId}` : `/receptions/${r.id}`);
  const cols: Col<ReceptionRow>[] = [
    { key: "number", label: t.receptions.numberLong, width: "5rem", text: (r) => (r.draftId ? "" : fmtNo("reception", r.number)), sort: (r) => r.number, href, render: (r) => (r.draftId ? "—" : fmtNo("reception", r.number)) },
    { key: "date", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateSort, date: (r) => r.day, className: "whitespace-nowrap" },
    { key: "supplier", label: t.common.supplier, text: (r) => r.supplierName },
    { key: "bl", label: t.receptions.blInvoice, text: (r) => r.blNumber ?? "", render: (r) => r.blNumber || (r.draftId ? "—" : t.receptions.noBl) },
    // Anomalie : nombre de fiches d'anomalie identifiées sur le bon
    { key: "anomalies", label: t.receptions.anomalyCol, align: "right", text: (r) => String(r.anomalyCount ?? 0), sort: (r) => r.anomalyCount ?? 0,
      render: (r) => (r.anomalyCount ? <span className="badge bg-red-100 font-semibold text-red-800">{r.anomalyCount}</span> : <span className="text-stone-400">0</span>) },
    { key: "status", label: t.common.status, text: (r) => r.statusLabel, options: Object.values(t.receptionStatus), render: (r) => <StatusBadge status={r.status} label={r.statusLabel} /> },
    {
      key: "state", label: t.nav.consolidation, text: stateLabel, options: [t.receptions.consolidated, t.receptions.toConsolidate, t.receptions.importedState],
      render: (r) => r.draftId
        ? <span className="text-xs text-stone-400">—</span>
        : r.consolidated
        ? <span className="badge bg-emerald-50 text-emerald-800"><Icon name="check" className="mr-0.5 h-3 w-3" />{t.receptions.consolidated}</span>
        : r.imported
        ? <span className="badge bg-violet-50 text-violet-800" title={t.receptions.importedHint}>{t.receptions.importedState}</span>
        : <span className="text-xs text-stone-500">{t.receptions.toConsolidate}</span>,
    },
    { key: "author", label: t.receptions.createdBy, text: (r) => r.author ?? "" },
    // Modifier : seulement une fiche de réception pas encore consolidée (brouillon : reprendre la saisie)
    ...(canEdit ? [{
      key: "edit", label: "", sortable: false, filterable: false, width: "3rem", text: () => "",
      render: (r: ReceptionRow) => (r.draftId
        ? <Link href={`/receptions/new?draft=${r.draftId}`} className="btn-ghost p-1.5 text-brand-700" title={t.receptions.resumeDraft} aria-label={t.receptions.resumeDraft}><Icon name="edit" className="h-4 w-4" /></Link>
        : !r.consolidated
        ? <Link href={`/receptions/${r.id}/edit`} className="btn-ghost p-1.5 text-brand-700" title={t.receptions.edit} aria-label={t.receptions.edit}><Icon name="edit" className="h-4 w-4" /></Link>
        : null),
    } as Col<ReceptionRow>] : []),
  ];
  const selectedRows = rows.filter((r) => sel.has(r.id));
  const deletable = selectedRows.filter((r) => !r.consolidated);
  const drafts = deletable.filter((r) => r.draftId);

  return (
    <>
      {canDelete && sel.size > 0 && (
        <div className="no-print mb-2 flex flex-wrap items-center gap-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <strong>{sel.size}</strong> {t.receptions.selected}
          {deletable.length < selectedRows.length && <span className="text-xs text-stone-600">({selectedRows.length - deletable.length} {t.receptions.consolidatedKept})</span>}
          <button
            className="btn-danger ml-auto px-3 py-1.5"
            disabled={pending || deletable.length === 0}
            onClick={async () => {
              if (!(await appConfirm(`${t.receptions.deleteManyConfirm} (${deletable.length})`))) return;
              start(async () => {
                await deleteReceptionsAction(deletable.filter((r) => !r.draftId).map((r) => r.id));
                for (const d of drafts) await fetch(`/api/drafts/${d.draftId}`, { method: "DELETE" });
                setSel(new Set());
                router.refresh();
              });
            }}
          >
            <Icon name="trash" className="h-4 w-4" /> {t.common.delete} ({deletable.length})
          </button>
          <button className="btn-ghost px-2 py-1.5" onClick={() => setSel(new Set())}>{t.consolidation.selectNone}</button>
        </div>
      )}
      <DataTable
        rows={rows}
        cols={cols}
        rowKey={(r) => r.id}
        empty={t.receptions.empty}
        defaultSort={{ key: "date", dir: "desc" }}
        selectable={canDelete}
        selection={sel}
        onSelectionChange={setSel}
      />
    </>
  );
}
