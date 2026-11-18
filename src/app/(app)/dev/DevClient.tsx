"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDevItemAction, reserveDevAction, saveDevItemAction, setDevTaskAction } from "@/lib/actions/dev";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";
import { DevRules, type CategoryRule } from "./DevRules";
import { DevProject, type ProjectKpis, type Roi } from "./DevProject";
import { DevFields, type FieldRow, type NatureRow } from "./DevFields";

interface Item { id: number; kind: string; title: string; detail: string; owner: string; priority: string; task: string; updated: string; updatedSort: string }
const TABS = ["project", "pending", "constraint", "idea", "done", "rules", "fields"] as const;
const prioStyle: Record<string, string> = { haute: "bg-red-100 text-red-800", moyenne: "bg-amber-100 text-amber-900", basse: "bg-stone-100 text-stone-600" };
const prioRank: Record<string, number> = { haute: 0, moyenne: 1, basse: 2, "": 3 };

/** Onglet Dev : sous-onglets (en attente, objectifs, contraintes, idées, réalisé, règles) ; tout est modifiable */
export function DevBoard({ items, reserved, tab, fields = [], natures = [], project, categories, canEdit = false }: { categories?: CategoryRule[]; canEdit?: boolean; items: Item[]; reserved: boolean; tab: string; fields?: FieldRow[]; natures?: NatureRow[]; project?: { doc: string; kpis: ProjectKpis; roi: Roi } }) {
  const { t } = useI18n();
  const d = t.dev;
  const router = useRouter();
  const current = (TABS as readonly string[]).includes(tab) ? tab : "pending";
  const [edit, setEdit] = useState<Partial<Item> | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      await saveDevItemAction(edit!.id ?? null, { kind: edit!.kind ?? current, title: edit!.title ?? "", detail: edit!.detail ?? "", owner: edit!.owner ?? "", priority: edit!.priority ?? "", task: edit!.task ?? "" });
      setEdit(null);
      router.refresh();
    });
  const remove = async (i: Item) => { if (await appConfirm(`${t.common.confirmDelete}\n${i.title}`)) start(async () => { await deleteDevItemAction(i.id); router.refresh(); }); };
  const done = (i: Item) => start(async () => { await saveDevItemAction(i.id, { ...i, kind: "done" }); router.refresh(); });

  // Tâches déjà utilisées (suggestions) et points de la même tâche (pour éviter les doublons)
  const tasks = [...new Set(items.map((i) => i.task).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const norm = (x: string) => x.trim().toLowerCase();
  const sameTask = edit?.task?.trim() ? items.filter((i) => i.id !== edit.id && norm(i.task) === norm(edit.task!)) : [];
  const form = (
    <div className="card mb-3 space-y-2 border-brand-200 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_9rem]">
        <input className="input" autoFocus placeholder={d.titlePh} value={edit?.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
        <select className="input" value={edit?.kind ?? current} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
          {TABS.filter((s) => s !== "rules").map((s) => <option key={s} value={s}>{d.sections[s as "pending"]}</option>)}
        </select>
        <select className="input" value={edit?.priority ?? ""} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>
          <option value="">{d.priority} —</option>
          {(["haute", "moyenne", "basse"] as const).map((p) => <option key={p} value={p}>{d.priorities[p]}</option>)}
        </select>
        <select className="input" value={edit?.owner ?? ""} onChange={(e) => setEdit({ ...edit, owner: e.target.value })}>
          <option value="">{d.owners.none}</option>
          <option value="moi">{d.owners.moi}</option>
          <option value="dev">{d.owners.dev}</option>
        </select>
      </div>
      <div>
        <input className="input" list="dev-tasks" placeholder={d.taskPh} value={edit?.task ?? ""} onChange={(e) => setEdit({ ...edit, task: e.target.value })} />
        {sameTask.length > 0 && (
          <div className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            <p className="font-semibold">{d.sameTask} ({sameTask.length})</p>
            <ul className="mt-0.5 list-disc pl-4">{sameTask.slice(0, 8).map((x) => <li key={x.id}>{x.title} <span className="text-amber-700">· {d.sections[x.kind as "pending"] ?? x.kind}</span></li>)}</ul>
          </div>
        )}
      </div>
      <textarea className="input" rows={2} placeholder={d.detailPh} value={edit?.detail ?? ""} onChange={(e) => setEdit({ ...edit, detail: e.target.value })} />
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>{t.common.cancel}</button>
        <button type="button" className="btn-primary" disabled={pending || !edit?.title?.trim()} onClick={save}><Icon name="check" className="h-4 w-4" /> {t.common.save}</button>
      </div>
    </div>
  );

  const list = items.filter((i) => i.kind === current);
  const count = (k: string) => items.filter((i) => i.kind === k).length;

  // Points en attente : tableau à filtres (priorité, responsable), trié par priorité
  const cols: Col<Item>[] = [
    { key: "priority", width: "6.5rem", label: d.priority, text: (i) => (i.priority ? d.priorities[i.priority as "haute"] : ""), sort: (i) => prioRank[i.priority] ?? 3, options: Object.values(d.priorities), render: (i) => (i.priority ? <span className={`badge ${prioStyle[i.priority]}`}>{d.priorities[i.priority as "haute"]}</span> : "—") },
    {
      key: "task", width: "11rem", label: d.taskCol, text: (i) => i.task, keepCase: true,
      render: (i) => <TaskCell id={i.id} value={i.task} placeholder={d.taskPh} />,
    },
    { key: "title", label: d.titleCol, text: (i) => `${i.title} ${i.detail}`, keepCase: true, render: (i) => <div><p className="font-medium">{i.title}</p>{i.detail && <p className="whitespace-pre-line text-xs text-stone-600">{i.detail}</p>}</div> },
    { key: "owner", width: "9rem", label: d.ownerCol, text: (i) => (i.owner ? d.owners[i.owner as "moi"] : ""), options: [d.owners.moi, d.owners.dev], render: (i) => (i.owner ? <span className={`badge ${i.owner === "moi" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>{d.owners[i.owner as "moi"]}</span> : "—") },
    { key: "updated", width: "7.5rem", label: d.updatedCol, text: (i) => i.updated, sort: (i) => i.updatedSort, filterable: false, keepCase: true },
    {
      key: "actions", width: "6.5rem", label: "", text: () => "", sortable: false, filterable: false,
      render: (i) => (
        <div className="flex gap-0.5">
          {i.kind !== "done" && <button type="button" className="btn-ghost p-1.5 text-emerald-700" title={d.markDone} onClick={() => done(i)}><Icon name="check" className="h-4 w-4" /></button>}
          <button type="button" className="btn-ghost p-1.5" title={t.common.edit} onClick={() => setEdit(i)}><Icon name="edit" className="h-4 w-4" /></button>
          <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" title={t.common.delete} onClick={() => remove(i)}><Icon name="trash" className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      {!reserved && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {d.notReserved}
          <button type="button" className="btn-secondary py-1 text-xs" onClick={() => start(async () => { await reserveDevAction(); router.refresh(); })}>{d.reserve}</button>
        </p>
      )}
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map((s) => (
          <Link key={s} href={s === "pending" ? "/dev" : `/dev?tab=${s}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${current === s ? "border-brand-600 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            {d.sections[s]}{!["rules", "fields", "automations", "project"].includes(s) && <span className="ml-1 text-xs font-normal text-stone-400">({count(s)})</span>}
          </Link>
        ))}
      </nav>

      {current === "rules" ? (
        <DevRules categories={categories} canEdit={canEdit} />
      ) : current === "project" ? (
        project ? <DevProject {...project} /> : null
      ) : current === "fields" ? (
        <DevFields fields={fields} natures={natures} />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-stone-600">{d.hints[current as "pending"]}</p>
            {!edit && <button type="button" className="btn-primary py-1.5" onClick={() => setEdit({ kind: current, owner: current === "pending" ? "moi" : "", priority: current === "pending" ? "moyenne" : "" })}><Icon name="plus" className="h-4 w-4" /> {t.common.add}</button>}
          </div>
          {edit && form}
          <datalist id="dev-tasks">{tasks.map((x) => <option key={x} value={x} />)}</datalist>
          <DataTable rows={list} cols={cols} rowKey={(i) => i.id} defaultSort={current === "done" ? { key: "updated", dir: "desc" } : { key: "priority", dir: "asc" }} dense fixed empty={d.empty} />
        </>
      )}
    </>
  );
}

/** Colonne « Tâche » : saisie directe (enregistrée en quittant le champ), avec les tâches déjà utilisées en suggestion */
function TaskCell({ id, value, placeholder }: { id: number; value: string; placeholder: string }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [, start] = useTransition();
  return (
    <input
      className="input w-full py-1 text-xs font-medium"
      list="dev-tasks"
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      onBlur={() => v.trim() !== value && start(async () => { await setDevTaskAction(id, v); router.refresh(); })}
    />
  );
}
