"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { consolidateAction } from "@/lib/actions/consolidation";
import { useI18n } from "@/lib/i18n/client";
import { StatusBadge } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";

interface Row { id: number; date: string; supplierName: string; blNumber: string | null; status: string; statusLabel: string }

/** Liste des bons à consolider : un bon, toute la journée filtrée, ou une sélection */
export function ConsolidateForm({ rows, canConsolidate }: { rows: Row[]; canConsolidate: boolean }) {
  const { t } = useI18n();
  const c = t.consolidation;
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (ids: number[], confirmText: string) => {
    if (!ids.length || !confirm(confirmText)) return;
    start(async () => {
      const { count } = await consolidateAction(ids);
      setSel(new Set());
      setMsg(`${count} ${c.done}`);
      router.refresh();
    });
  };

  return (
    <div className="card">
      {canConsolidate && (
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-3">
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSel(new Set(rows.map((r) => r.id)))}>{c.selectAll}</button>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSel(new Set())}>{c.selectNone}</button>
          <button type="button" className="btn-primary ml-auto" disabled={!sel.size || pending} onClick={() => run([...sel], c.confirm)}>
            <Icon name="layers" className="h-4 w-4" /> {c.run} {sel.size > 0 && `(${sel.size})`}
          </button>
        </div>
      )}
      {msg && <p className="border-b border-stone-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      <ul className="divide-y divide-stone-100">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
            {canConsolidate && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="h-5 w-5 shrink-0 accent-brand-600" aria-label={r.blNumber ?? String(r.id)} />}
            <Link href={`/receptions/${r.id}`} className="w-28 shrink-0 truncate text-sm font-medium text-brand-700 hover:underline">{r.blNumber || <span className="italic text-stone-500">{t.receptions.noBl}</span>}</Link>
            <span className="hidden w-32 shrink-0 text-sm tabular-nums text-stone-600 sm:inline">{r.date}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{r.supplierName}</span>
            <StatusBadge status={r.status} label={r.statusLabel} />
            {canConsolidate && (
              <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={pending} onClick={() => run([r.id], c.confirmOne)}>
                <Icon name="check" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{c.thisOne}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
