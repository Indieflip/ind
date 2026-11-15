"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { consolidateAction } from "@/lib/actions/consolidation";
import { useI18n } from "@/lib/i18n/client";
import { StatusBadge } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { appConfirm } from "@/components/Confirm";
import { DataTable, type Col } from "@/components/table/DataTable";

interface Row { id: number; date: string; dateSort: string; supplierName: string; blNumber: string | null; status: string; statusLabel: string }

/** Bons à consolider : un bon, toute la journée filtrée, ou une sélection */
export function ConsolidateForm({ rows, canConsolidate }: { rows: Row[]; canConsolidate: boolean }) {
  const { t } = useI18n();
  const c = t.consolidation;
  const router = useRouter();
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const run = async (ids: number[], confirmText: string) => {
    if (!ids.length || !(await appConfirm(confirmText, { danger: false }))) return;
    start(async () => {
      const { count } = await consolidateAction(ids);
      setSel(new Set());
      setMsg(`${count} ${c.done}`);
      router.refresh();
    });
  };
  const cols: Col<Row>[] = [
    { key: "bl", label: t.receptions.bl, text: (r) => r.blNumber ?? "", href: (r) => `/receptions/${r.id}`, render: (r) => r.blNumber || t.receptions.noBl },
    { key: "date", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateSort, className: "whitespace-nowrap" },
    { key: "supplier", label: t.common.supplier, text: (r) => r.supplierName },
    { key: "status", label: t.common.status, text: (r) => r.statusLabel, render: (r) => <StatusBadge status={r.status} label={r.statusLabel} /> },
    ...(canConsolidate
      ? [{
          key: "action", label: "", text: () => "", sortable: false, filterable: false,
          render: (r: Row) => (
            <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={pending} onClick={() => run([r.id], c.confirmOne)}>
              <Icon name="check" className="h-3.5 w-3.5" /> {c.thisOne}
            </button>
          ),
        } as Col<Row>]
      : []),
  ];
  return (
    <>
      {canConsolidate && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={!sel.size || pending} onClick={() => run(rows.filter((r) => sel.has(r.id)).map((r) => r.id), c.confirm)}>
            <Icon name="layers" className="h-4 w-4" /> {c.run} {sel.size > 0 && `(${sel.size})`}
          </button>
          {msg && <span className="rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-800">{msg}</span>}
        </div>
      )}
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} selectable={canConsolidate} selection={sel} onSelectionChange={setSel} defaultSort={{ key: "date", dir: "asc" }} empty={c.none} maxHeight="max-h-[60vh]" />
    </>
  );
}

interface DoneRow { id: number; blNumber: string | null; date: string; dateSort: string; supplierName: string; status: string; statusLabel: string; consolidated: string; consolidatedSort: string; notes: number }

export function ConsolidatedTable({ rows }: { rows: DoneRow[] }) {
  const { t } = useI18n();
  const cols: Col<DoneRow>[] = [
    { key: "bl", label: t.receptions.bl, text: (r) => r.blNumber ?? "", href: (r) => `/receptions/${r.id}`, render: (r) => r.blNumber || t.receptions.noBl },
    { key: "date", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateSort, className: "whitespace-nowrap" },
    { key: "supplier", label: t.common.supplier, text: (r) => r.supplierName },
    { key: "status", label: t.common.status, text: (r) => r.statusLabel, render: (r) => <StatusBadge status={r.status} label={r.statusLabel} /> },
    { key: "consolidated", label: t.receptions.consolidatedOn, text: (r) => r.consolidated, sort: (r) => r.consolidatedSort, className: "whitespace-nowrap text-stone-600" },
    { key: "notes", label: t.consolidation.notes, align: "right", text: (r) => (r.notes ? String(r.notes) : ""), sort: (r) => r.notes },
  ];
  return <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} defaultSort={{ key: "consolidated", dir: "desc" }} empty={t.consolidation.noneConsolidated} maxHeight="max-h-[60vh]" />;
}
