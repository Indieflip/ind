"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTempClassAction, saveTempClassAction, setCategoryClassAction } from "@/lib/actions/thresholds";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";

interface TempClass { id: number; label: string; maxTemp: number; reserveMax: number | null }

/** Administrateur : seuils réglementaires (ajout, modification, suppression) */
export function ThresholdsEditor({ classes }: { classes: TempClass[] }) {
  const { t } = useI18n();
  const p = t.protocols;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState({ label: "", maxTemp: "", reserveMax: "" });
  const save = (id: number | null, v: { label: string; maxTemp: string; reserveMax: string }) => start(async () => { await saveTempClassAction(id, v); if (!id) setAdding({ label: "", maxTemp: "", reserveMax: "" }); router.refresh(); });
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>{p.tempClass}</th><th className="w-28 text-right">{p.maxTemp}</th><th className="w-36 text-right">{p.marginUpTo}</th><th className="w-10" /></tr></thead>
        <tbody>
          {classes.map((k) => <ClassRow key={`${k.id}-${k.label}-${k.maxTemp}-${k.reserveMax}`} k={k} onSave={(v) => save(k.id, v)} onDelete={async () => { if (await appConfirm(p.deleteClassConfirm)) start(async () => { await deleteTempClassAction(k.id); router.refresh(); }); }} pending={pending} />)}
          <tr className="bg-stone-50">
            <td><input className="input py-1.5" placeholder={p.newClass} value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} /></td>
            <td><input className="input py-1.5 text-right" inputMode="decimal" placeholder="°C" value={adding.maxTemp} onChange={(e) => setAdding({ ...adding, maxTemp: e.target.value })} /></td>
            <td><input className="input py-1.5 text-right" inputMode="decimal" placeholder="°C" value={adding.reserveMax} onChange={(e) => setAdding({ ...adding, reserveMax: e.target.value })} /></td>
            <td><button type="button" className="btn-primary px-2 py-1.5" disabled={pending || !adding.label.trim() || !adding.maxTemp.trim()} onClick={() => save(null, adding)} aria-label={t.common.add}><Icon name="plus" className="h-4 w-4" /></button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ClassRow({ k, onSave, onDelete, pending }: { k: TempClass; onSave: (v: { label: string; maxTemp: string; reserveMax: string }) => void; onDelete: () => void; pending: boolean }) {
  const { t } = useI18n();
  const [v, setV] = useState({ label: k.label, maxTemp: String(k.maxTemp).replace(".", ","), reserveMax: k.reserveMax == null ? "" : String(k.reserveMax).replace(".", ",") });
  const commit = () => { if (v.label !== k.label || v.maxTemp !== String(k.maxTemp).replace(".", ",") || v.reserveMax !== (k.reserveMax == null ? "" : String(k.reserveMax).replace(".", ","))) onSave(v); };
  return (
    <tr>
      <td><input className="input py-1.5" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} onBlur={commit} /></td>
      <td><input className="input py-1.5 text-right" inputMode="decimal" value={v.maxTemp} onChange={(e) => setV({ ...v, maxTemp: e.target.value })} onBlur={commit} /></td>
      <td><input className="input py-1.5 text-right" inputMode="decimal" value={v.reserveMax} onChange={(e) => setV({ ...v, reserveMax: e.target.value })} onBlur={commit} /></td>
      <td><button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" disabled={pending} onClick={onDelete} aria-label={t.common.delete}><Icon name="trash" className="h-4 w-4" /></button></td>
    </tr>
  );
}

/** Administrateur : classe de température appliquée à chaque catégorie de produits */
export function CategoryClassSelect({ categoryId, value, classes }: { categoryId: number; value: number | null; classes: TempClass[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select className="input py-1.5" disabled={pending} defaultValue={value ?? ""} onChange={(e) => start(async () => { await setCategoryClassAction(categoryId, e.target.value ? Number(e.target.value) : null); router.refresh(); })}>
      <option value="">{t.protocols.noReading}</option>
      {classes.map((k) => <option key={k.id} value={k.id}>{k.label} ({k.maxTemp > 0 ? "+" : ""}{String(k.maxTemp).replace("-", "−")} °C)</option>)}
    </select>
  );
}
