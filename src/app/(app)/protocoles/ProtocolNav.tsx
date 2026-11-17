"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { addFolderAction, deleteFolderAction, moveProtocolAction, renameFolderAction } from "@/lib/actions/protocols";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";

interface P { id: number; title: string; folder: string | null }

/** Menu des protocoles rangés par dossiers (dossiers repliables ; l'éditeur crée, renomme, supprime les dossiers) */
export function ProtocolNav({ list, folders, currentId, conformity, editable }: { list: P[]; folders: string[]; currentId: number | null; conformity: boolean; editable: boolean }) {
  const { t } = useI18n();
  const p = t.protocols;
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  const item = (x: P) => (
    <div key={x.id} className="group flex items-center">
      <Link href={`/protocoles?id=${x.id}`} className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${currentId === x.id ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
        <Icon name="book" className="h-4 w-4 shrink-0" /> <span className="truncate">{x.title}</span>
      </Link>
      {editable && (
        <select
          className="ml-1 hidden w-6 shrink-0 cursor-pointer appearance-none rounded bg-transparent text-center text-xs text-stone-400 group-hover:block"
          title={p.moveTo}
          aria-label={p.moveTo}
          value=""
          disabled={pending}
          onChange={(e) => run(() => moveProtocolAction(x.id, e.target.value === "__root" ? null : e.target.value))}
        >
          <option value="">⇄</option>
          <option value="__root">{p.root}</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      )}
    </div>
  );
  const root = list.filter((x) => !x.folder);
  return (
    <nav className="no-print card h-fit p-2">
      {root.map(item)}
      {folders.map((f) => {
        const inside = list.filter((x) => x.folder === f);
        return (
          <details key={f} open={inside.some((x) => x.id === currentId) || inside.length <= 6} className="group/folder">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100">
              <span className="text-stone-400 transition group-open/folder:rotate-90">▸</span>
              <span>📁</span>
              <span className="flex-1 truncate">{f}</span>
              <span className="text-xs font-normal text-stone-400">{inside.length}</span>
              {editable && (
                <span className="flex gap-0.5" onClick={(e) => e.preventDefault()}>
                  <button type="button" className="rounded px-1 text-xs text-stone-400 hover:bg-stone-200 hover:text-stone-700" title={p.renameFolder} onClick={() => { const n = window.prompt(p.renameFolder, f); if (n && n.trim() && n !== f) run(() => renameFolderAction(f, n)); }}>✎</button>
                  <button type="button" className="rounded px-1 text-xs text-stone-400 hover:bg-stone-200 hover:text-red-600" title={p.deleteFolder} onClick={async () => { if (await appConfirm(p.deleteFolderConfirm)) run(() => deleteFolderAction(f)); }}>✕</button>
                </span>
              )}
            </summary>
            <div className="ml-4 border-l border-stone-200 pl-1">
              {inside.length ? inside.map(item) : <p className="px-3 py-1.5 text-xs text-stone-400">{p.emptyFolder}</p>}
            </div>
          </details>
        );
      })}
      {list.length === 0 && <p className="p-2 text-sm text-stone-500">{p.empty}</p>}
      <div className="my-1 border-t border-stone-100" />
      <Link href="/protocoles?id=conformite" className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${conformity ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
        <Icon name="check" className="h-4 w-4" /> {p.conformity}
      </Link>
      {editable && (
        <button type="button" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-700 hover:bg-brand-50" disabled={pending} onClick={() => { const n = window.prompt(p.newFolder); if (n && n.trim()) run(() => addFolderAction(n)); }}>
          <Icon name="plus" className="h-4 w-4" /> {p.newFolder}
        </button>
      )}
    </nav>
  );
}
