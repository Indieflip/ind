"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addModificationAction, createSheetAction, deleteExportedSheetsAction, refreshPendingAction, reviewSheetAction, setSheetValidatorsAction } from "@/lib/actions/sheets";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

/** Édite (crée ou ouvre) la fiche d'un jour */
export function EditSheetButton({ date, label, className = "btn-primary" }: { date: string; label: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className={className} disabled={pending} onClick={() => start(async () => { const r = await createSheetAction(date); if (r.id) router.push(`/receptions/fiches/${r.id}`); })}>
      <Icon name="file" className="h-4 w-4" /> {pending ? "…" : label}
    </button>
  );
}

/** Choix d'un autre jour */
export function EditSheetForDate({ today }: { today: string }) {
  const { t } = useI18n();
  const [date, setDate] = useState(today);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label><span className="label">{t.rsheet.editDate}</span><input type="date" className="input py-2" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
      <EditSheetButton date={date} label={t.rsheet.edit} className="btn-secondary py-2" />
    </div>
  );
}

/** Actions sur la dernière version : mise à jour (en attente), validation / refus (responsable), modification (validée ou refusée) */
export function SheetActions({ sheetId, versionId, status, canValidate }: { sheetId: number; versionId: number; status: string; canValidate: boolean }) {
  const { t } = useI18n();
  const f = t.rsheet;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [modifying, setModifying] = useState(false);
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); setReason(""); setNote(""); setRejecting(false); setModifying(false); router.refresh(); });

  if (status === "pending") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => refreshPendingAction(sheetId))}><Icon name="layers" className="h-4 w-4" /> {f.refresh}</button>
          <span className="text-xs text-stone-500">{f.refreshHint}</span>
        </div>
        {canValidate ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-2 text-sm text-emerald-900">{f.validateHint}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => reviewSheetAction(versionId, "validated", ""))}><Icon name="check" className="h-4 w-4" /> {f.validate}</button>
              {!rejecting && <button type="button" className="btn-secondary" onClick={() => setRejecting(true)}>{f.reject}</button>}
            </div>
            {rejecting && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-64 flex-1"><span className="label">{f.rejectNote}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
                <button type="button" className="btn-danger" disabled={pending || !note.trim()} onClick={() => run(() => reviewSheetAction(versionId, "rejected", note))}>{f.reject}</button>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{f.notValidator}</p>
        )}
      </div>
    );
  }
  return modifying ? (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm text-amber-900">{f.modificationHint}</p>
      <label className="block"><span className="label">{f.modificationReason}</span><textarea className="input" rows={2} value={reason} placeholder={f.modificationReasonPh} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={pending || !reason.trim()} onClick={() => run(() => addModificationAction(sheetId, reason))}>{f.submit}</button>
        <button type="button" className="btn-ghost" onClick={() => setModifying(false)}>{t.common.cancel}</button>
      </div>
    </div>
  ) : (
    <button type="button" className="btn-secondary" onClick={() => setModifying(true)}><Icon name="edit" className="h-4 w-4" /> {f.addModification}</button>
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
