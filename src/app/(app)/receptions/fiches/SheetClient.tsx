"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteExportedSheetsAction, setSheetValidatorsAction } from "@/lib/actions/sheets";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

/** Export manuel : choix des bons (n'importe lesquels), puis PDF ou Excel ; l'export est ajouté à l'historique */
export function ManualExport({ rows }: { rows: { id: number; date: string; supplier: string; docs: string; status: string; consolidated: boolean }[] }) {
  const { t } = useI18n();
  const f = t.rsheet;
  const router = useRouter();
  const [ids, setIds] = useState<number[]>([]);
  const all = rows.length > 0 && ids.length === rows.length;
  return (
    <form method="post" action="/api/fiches/manuel" onSubmit={() => setTimeout(() => router.refresh(), 2500)}>
      {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-600">{ids.length} {f.selected}</span>
        <button name="format" value="pdf" className="btn-primary py-1.5" disabled={!ids.length}><Icon name="download" className="h-4 w-4" /> {f.exportSelection} · {f.pdf}</button>
        <button name="format" value="xlsx" className="btn-secondary py-1.5" disabled={!ids.length}><Icon name="download" className="h-4 w-4" /> {f.excel}</button>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-lg border border-stone-200">
        <table className="table text-sm">
          <thead className="sticky top-0 bg-white">
            <tr>
              <th className="w-10"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={all} onChange={(e) => setIds(e.target.checked ? rows.map((r) => r.id) : [])} aria-label={f.selectAll} /></th>
              <th>{t.common.date}</th><th>{t.common.supplier}</th><th>{t.receptions.blInvoice}</th><th>{t.common.status}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-stone-500">{f.empty}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => setIds(ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id])}>
                <td><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={ids.includes(r.id)} readOnly /></td>
                <td className="whitespace-nowrap">{r.date}</td>
                <td>{r.supplier}</td>
                <td className="text-stone-600">{r.docs}</td>
                <td className="text-xs text-stone-600">{r.status}{r.consolidated && " · ✓"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
