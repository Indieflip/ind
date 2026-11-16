"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDevItemAction, reserveDevAction, saveDevItemAction } from "@/lib/actions/dev";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";

interface Item { id: number; kind: string; title: string; detail: string; owner: string; updated: string }
const SECTIONS = ["objective", "pending", "idea", "done"] as const;
const tone: Record<string, string> = { objective: "border-l-brand-500", pending: "border-l-amber-400", idea: "border-l-sky-400", done: "border-l-emerald-500" };

export function DevBoard({ items, reserved }: { items: Item[]; reserved: boolean }) {
  const { t } = useI18n();
  const d = t.dev;
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Item> | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      await saveDevItemAction(edit!.id ?? null, { kind: edit!.kind ?? "pending", title: edit!.title ?? "", detail: edit!.detail ?? "", owner: edit!.owner ?? "" });
      setEdit(null);
      router.refresh();
    });
  const form = (
    <div className="card mb-3 space-y-2 border-brand-200 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem]">
        <input className="input" autoFocus placeholder={d.titlePh} value={edit?.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
        <select className="input" value={edit?.kind ?? "pending"} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
          {SECTIONS.map((s) => <option key={s} value={s}>{d.sections[s]}</option>)}
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
  return (
    <>
      {!reserved && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {d.notReserved}
          <button type="button" className="btn-secondary py-1 text-xs" onClick={() => start(async () => { await reserveDevAction(); router.refresh(); })}>{d.reserve}</button>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((s) => {
          const list = items.filter((i) => i.kind === s);
          return (
            <section key={s}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{d.sections[s]} <span className="text-sm font-normal text-stone-500">({list.length})</span></h2>
                <button type="button" className="btn-ghost px-2 py-1 text-sm text-brand-700" onClick={() => setEdit({ kind: s, owner: s === "pending" ? "moi" : "" })}><Icon name="plus" className="h-4 w-4" /> {t.common.add}</button>
              </div>
              {edit && !edit.id && edit.kind === s && form}
              <ul className="space-y-2">
                {list.map((i) =>
                  edit?.id === i.id ? <li key={i.id}>{form}</li> : (
                    <li key={i.id} className={`card border-l-4 p-3 ${tone[s]}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`font-medium ${s === "done" ? "text-stone-500 line-through" : ""}`}>{i.title}</p>
                          {i.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-stone-600">{i.detail}</p>}
                          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-stone-400">
                            {i.owner && <span className={`badge ${i.owner === "moi" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>{d.owners[i.owner as "moi"]}</span>}
                            <span>{d.updated} {i.updated}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          {s !== "done" && s !== "objective" && (
                            <button type="button" className="btn-ghost p-1.5 text-emerald-700" title={d.markDone} onClick={() => start(async () => { await saveDevItemAction(i.id, { ...i, kind: "done" }); router.refresh(); })}><Icon name="check" className="h-4 w-4" /></button>
                          )}
                          <button type="button" className="btn-ghost p-1.5" title={t.common.edit} onClick={() => setEdit(i)}><Icon name="edit" className="h-4 w-4" /></button>
                          <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" title={t.common.delete} onClick={async () => { if (await appConfirm(`${t.common.confirmDelete}\n${i.title}`)) start(async () => { await deleteDevItemAction(i.id); router.refresh(); }); }}><Icon name="trash" className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
