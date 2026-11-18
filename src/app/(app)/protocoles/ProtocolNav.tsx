"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addFolderAction, deleteFolderAction, moveProtocolAction, renameFolderAction } from "@/lib/actions/protocols";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";

interface P { id: number; title: string; folder: string | null }
const ROOT = "__root";

/**
 * Menu des protocoles rangés par dossiers.
 * Dossier : « Nouveau dossier » → on tape le nom (Entrée) ; on glisse les protocoles dedans ; ✕ pour supprimer.
 * Sur téléphone (pas de glisser-déposer) : le petit menu ⇄ à côté d'un protocole.
 */
export function ProtocolNav({ list, folders, currentId, conformity, proc = null, editable }: { list: P[]; folders: string[]; currentId: number | null; conformity: boolean; proc?: string | null; editable: boolean }) {
  const { t } = useI18n();
  const p = t.protocols;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const drop = (target: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId == null) return; e.preventDefault(); setOver(target); },
    onDragLeave: () => setOver((o) => (o === target ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = dragId;
      setOver(null);
      setDragId(null);
      const p0 = list.find((x) => x.id === id);
      if (id == null || !p0 || (p0.folder ?? ROOT) === target) return;
      run(() => moveProtocolAction(id, target === ROOT ? null : target));
    },
  });
  const zone = (target: string) => (over === target ? "bg-brand-50 ring-2 ring-brand-300" : "");

  const item = (x: P) => (
    <div
      key={x.id}
      className={`group flex items-center rounded-lg ${dragId === x.id ? "opacity-40" : ""}`}
      draggable={editable}
      onDragStart={(e) => { setDragId(x.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => { setDragId(null); setOver(null); }}
    >
      <Link href={`/protocoles?id=${x.id}`} className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${currentId === x.id ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
        {editable && <span className="hidden cursor-grab text-stone-300 group-hover:inline" aria-hidden>⠿</span>}
        <Icon name="book" className="h-4 w-4 shrink-0" /> <span className="truncate">{x.title}</span>
      </Link>
      {editable && folders.length > 0 && (
        <select
          className="ml-1 w-6 shrink-0 cursor-pointer appearance-none rounded bg-transparent text-center text-xs text-stone-400 lg:hidden lg:group-hover:block"
          title={p.moveTo}
          aria-label={p.moveTo}
          value=""
          disabled={pending}
          onChange={(e) => run(() => moveProtocolAction(x.id, e.target.value === ROOT ? null : e.target.value))}
        >
          <option value="">⇄</option>
          <option value={ROOT}>{p.root}</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      )}
    </div>
  );
  const root = list.filter((x) => !x.folder);

  return (
    <nav className="no-print card h-fit p-2">
      <div className={`min-h-2 rounded-lg ${zone(ROOT)}`} {...(editable ? drop(ROOT) : {})}>
        {root.map(item)}
      </div>
      {folders.map((f) => {
        const inside = list.filter((x) => x.folder === f);
        return (
          <details key={f} open className={`group/folder rounded-lg ${zone(f)}`} {...(editable ? drop(f) : {})}>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100">
              <span className="text-stone-400 transition group-open/folder:rotate-90">▸</span>
              <span>📁</span>
              {renaming === f ? (
                <input
                  autoFocus
                  className="input min-w-0 flex-1 py-0.5 text-sm"
                  value={rename}
                  onClick={(e) => e.preventDefault()}
                  onChange={(e) => setRename(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); if (rename.trim() && rename !== f) run(() => renameFolderAction(f, rename)); setRenaming(null); }
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={() => { if (rename.trim() && rename !== f) run(() => renameFolderAction(f, rename)); setRenaming(null); }}
                />
              ) : (
                <span className="flex-1 truncate" onDoubleClick={(e) => { if (!editable) return; e.preventDefault(); setRenaming(f); setRename(f); }}>{f}</span>
              )}
              <span className="text-xs font-normal text-stone-400">{inside.length}</span>
              {editable && renaming !== f && (
                <span className="flex gap-0.5" onClick={(e) => e.preventDefault()}>
                  <button type="button" className="rounded px-1 text-xs text-stone-400 hover:bg-stone-200 hover:text-stone-700" title={p.renameFolder} aria-label={p.renameFolder} onClick={() => { setRenaming(f); setRename(f); }}>✎</button>
                  <button type="button" className="rounded px-1 text-xs text-stone-400 hover:bg-stone-200 hover:text-red-600" title={p.deleteFolder} aria-label={p.deleteFolder} onClick={async () => { if (await appConfirm(p.deleteFolderConfirm)) run(() => deleteFolderAction(f)); }}>✕</button>
                </span>
              )}
            </summary>
            <div className="ml-4 border-l border-stone-200 pl-1">
              {inside.length ? inside.map(item) : <p className="px-3 py-1.5 text-xs text-stone-400">{editable ? p.dropHere : p.emptyFolder}</p>}
            </div>
          </details>
        );
      })}
      {list.length === 0 && <p className="p-2 text-sm text-stone-500">{p.empty}</p>}
      <div className="my-1 border-t border-stone-100" />
      <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">{p.procedures}</p>
      {([["proc-reception", "reception", p.procReception, "truck"], ["proc-reclamation", "reclamation", p.procClaim, "inbox"], ["conformite", "conformite", p.conformity, "check"]] as const).map(([id, key, label, icon]) => {
        const on = key === "conformite" ? conformity : proc === key;
        return (
          <Link key={id} href={`/protocoles?id=${id}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${on ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
            <Icon name={icon} className="h-4 w-4" /> {label}
          </Link>
        );
      })}
      {editable && (creating ? (
        <form
          className="mt-1 flex items-center gap-1 px-1"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => addFolderAction(name)); setName(""); setCreating(false); }}
        >
          <span className="px-1">📁</span>
          <input autoFocus className="input min-w-0 flex-1 py-1 text-sm" placeholder={p.folderName} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setCreating(false)} />
          <button className="btn-primary px-2 py-1 text-xs" disabled={!name.trim() || pending}>OK</button>
        </form>
      ) : (
        <button type="button" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-700 hover:bg-brand-50" disabled={pending} onClick={() => setCreating(true)}>
          <Icon name="plus" className="h-4 w-4" /> {p.newFolder}
        </button>
      ))}
      {editable && folders.length > 0 && <p className="hidden px-3 pb-1 pt-2 text-[11px] text-stone-400 lg:block">{p.dragHint}</p>}
    </nav>
  );
}
