"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDevItemAction, reserveDevAction, saveDevItemAction } from "@/lib/actions/dev";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";
import { DevRules } from "./DevRules";
import { DevAutomations } from "./DevAutomations";
import { DevFields, type FieldRow, type NatureRow } from "./DevFields";

interface Item { id: number; kind: string; title: string; detail: string; owner: string; priority: string; updated: string; updatedSort: string }
const TABS = ["pending", "objective", "constraint", "idea", "done", "rules", "fields", "automations"] as const;
const prioStyle: Record<string, string> = { haute: "bg-red-100 text-red-800", moyenne: "bg-amber-100 text-amber-900", basse: "bg-stone-100 text-stone-600" };
const prioRank: Record<string, number> = { haute: 0, moyenne: 1, basse: 2, "": 3 };

/** Onglet Dev : sous-onglets (en attente, objectifs, contraintes, idées, réalisé, règles) ; tout est modifiable */
export function DevBoard({ items, reserved, tab, fields = [], natures = [] }: { items: Item[]; reserved: boolean; tab: string; fields?: FieldRow[]; natures?: NatureRow[] }) {
  const { t } = useI18n();
  const d = t.dev;
  const router = useRouter();
  const current = (TABS as readonly string[]).includes(tab) ? tab : "pending";
  const [edit, setEdit] = useState<Partial<Item> | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      await saveDevItemAction(edit!.id ?? null, { kind: edit!.kind ?? current, title: edit!.title ?? "", detail: edit!.detail ?? "", owner: edit!.owner ?? "", priority: edit!.priority ?? "" });
      setEdit(null);
      router.refresh();
    });
  const remove = async (i: Item) => { if (await appConfirm(`${t.common.confirmDelete}\n${i.title}`)) start(async () => { await deleteDevItemAction(i.id); router.refresh(); }); };
  const done = (i: Item) => start(async () => { await saveDevItemAction(i.id, { ...i, kind: "done" }); router.refresh(); });

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
    { key: "title", label: d.titleCol, text: (i) => `${i.title} ${i.detail}`, keepCase: true, render: (i) => <div><p className="font-medium">{i.title}</p>{i.detail && <p className="whitespace-pre-line text-xs text-stone-600">{i.detail}</p>}</div> },
    { key: "owner", width: "9rem", label: d.ownerCol, text: (i) => (i.owner ? d.owners[i.owner as "moi"] : ""), options: [d.owners.moi, d.owners.dev], render: (i) => (i.owner ? <span className={`badge ${i.owner === "moi" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>{d.owners[i.owner as "moi"]}</span> : "—") },
    { key: "updated", width: "7.5rem", label: d.updatedCol, text: (i) => i.updated, sort: (i) => i.updatedSort, filterable: false, keepCase: true },
    {
      key: "actions", width: "6.5rem", label: "", text: () => "", sortable: false, filterable: false,
      render: (i) => (
        <div className="flex gap-0.5">
          <button type="button" className="btn-ghost p-1.5 text-emerald-700" title={d.markDone} onClick={() => done(i)}><Icon name="check" className="h-4 w-4" /></button>
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
            {d.sections[s]}{s !== "rules" && s !== "fields" && s !== "automations" && <span className="ml-1 text-xs font-normal text-stone-400">({count(s)})</span>}
          </Link>
        ))}
      </nav>

      {current === "rules" ? (
        <DevRules />
      ) : current === "automations" ? (
        <DevAutomations />
      ) : current === "fields" ? (
        <DevFields fields={fields} natures={natures} />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-stone-600">{d.hints[current as "pending"]}</p>
            {!edit && <button type="button" className="btn-primary py-1.5" onClick={() => setEdit({ kind: current, owner: current === "pending" ? "moi" : "", priority: current === "pending" ? "moyenne" : "" })}><Icon name="plus" className="h-4 w-4" /> {t.common.add}</button>}
          </div>
          {edit && form}
          {current === "pending" ? (
            <DataTable rows={list} cols={cols} rowKey={(i) => i.id} defaultSort={{ key: "priority", dir: "asc" }} dense fixed empty={d.empty} />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {list.length === 0 && <li className="text-sm text-stone-500">{d.empty}</li>}
              {list.map((i) => (
                <li key={i.id} className="card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-medium ${current === "done" ? "text-stone-500 line-through" : ""}`}>{i.title}</p>
                      {i.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-stone-600">{i.detail}</p>}
                      <p className="mt-1 text-[11px] text-stone-400">{d.updated} {i.updated}</p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" className="btn-ghost p-1.5" title={t.common.edit} onClick={() => setEdit(i)}><Icon name="edit" className="h-4 w-4" /></button>
                      <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" title={t.common.delete} onClick={() => remove(i)}><Icon name="trash" className="h-4 w-4" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
