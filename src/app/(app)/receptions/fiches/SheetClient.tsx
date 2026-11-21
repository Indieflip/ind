"use client";
import { dayOf } from "@/lib/numbering";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteExportedSheetsAction, setSheetValidatorsAction } from "@/lib/actions/sheets";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";

type ManualRow = { id: number; date: string; dateSort: string; supplier: string; docs: string; status: string; consolidated: boolean };

/** Export manuel : choix des bons (n'importe lesquels, filtres dans les en-têtes), puis PDF ou Excel ; l'export est ajouté à l'historique */
export function ManualExport({ rows }: { rows: ManualRow[] }) {
  const { t } = useI18n();
  const f = t.rsheet;
  const router = useRouter();
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const cols: Col<ManualRow>[] = [
    { key: "date", label: t.common.date, text: (r) => r.date, sort: (r) => r.dateSort, date: (r) => dayOf(r.dateSort), className: "whitespace-nowrap" },
    { key: "supplier", label: t.common.supplier, text: (r) => r.supplier },
    { key: "docs", label: t.receptions.blInvoice, text: (r) => r.docs, keepCase: true },
    { key: "status", label: t.common.status, text: (r) => r.status },
    { key: "consolidated", label: t.receptions.consolidated, text: (r) => (r.consolidated ? t.common.yes : t.common.no), options: [t.common.yes, t.common.no] },
  ];
  return (
    <form method="post" action="/api/fiches/manuel" onSubmit={() => setTimeout(() => router.refresh(), 2500)}>
      {[...sel].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-600">{sel.size} {f.selected}</span>
        <button name="format" value="pdf" className="btn-primary py-1.5" disabled={!sel.size}><Icon name="download" className="h-4 w-4" /> {f.exportSelection} · {f.pdf}</button>
        <button name="format" value="xlsx" className="btn-secondary py-1.5" disabled={!sel.size}><Icon name="download" className="h-4 w-4" /> {f.excel}</button>
        {sel.size > 0 && <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setSel(new Set())}>{t.consolidation.selectNone}</button>}
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} selectable selection={sel} onSelectionChange={setSel} defaultSort={{ key: "date", dir: "desc" }} pageSize={50} dense empty={f.empty} />
    </form>
  );
}

/** Administrateur : responsables désignés */
export function ValidatorsPicker({ users, selected }: { users: { id: number; name: string; role: string }[]; selected: number[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [ids, setIds] = useState(selected);
  const [pending, start] = useTransition();
  const dirty = [...ids].sort().join() !== [...selected].sort().join();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {users.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={ids.includes(u.id) || u.role === "admin"} disabled={u.role === "admin"} onChange={(e) => setIds(e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id))} />
            {u.name} <span className="text-xs text-stone-400">({t.roles[u.role as keyof typeof t.roles]})</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn-primary py-1.5" disabled={!dirty || pending} onClick={() => start(async () => { await setSheetValidatorsAction(ids); router.refresh(); })}>{t.common.save}</button>
    </div>
  );
}

/** Administrateur : suppression des fiches exportées (demande de suppression avant 5 ans) */
export function DeleteExported({ count }: { count: number }) {
  const { t } = useI18n();
  const f = t.rsheet;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <>
      <button
        type="button"
        className="btn-danger"
        disabled={pending || !count}
        onClick={() => {
          const typed = window.prompt(f.deleteConfirm);
          if (typed == null) return;
          start(async () => { const r = await deleteExportedSheetsAction(typed.trim()); if (r.ok) setMsg(`${r.count} ${f.deleted}`); router.refresh(); });
        }}
      >
        <Icon name="trash" className="h-4 w-4" /> {f.deleteExported} ({count})
      </button>
      {msg && <span className="text-sm text-emerald-700">{msg}</span>}
    </>
  );
}
