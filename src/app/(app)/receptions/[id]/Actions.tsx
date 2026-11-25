"use client";
import { appConfirm } from "@/components/Confirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNoteAction, consolidateImportedAction } from "@/lib/actions/consolidation";
import { deleteReceptionAction } from "@/lib/actions/receptions";
import { Icon } from "@/components/Icon";
import { updateAnomalyAction } from "@/lib/actions/anomalies";

export function PrintButton({ label }: { label: string }) {
  return <button className="btn-secondary" onClick={() => window.print()}><Icon name="print" className="h-4 w-4" /> {label}</button>;
}

export function DeleteReceptionButton({ id, label, confirmText }: { id: number; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost text-red-600" disabled={pending} onClick={async () => await appConfirm(confirmText) && start(() => deleteReceptionAction(id))}>
      <Icon name="trash" className="h-4 w-4" /> {label}
    </button>
  );
}

/** Ancienne fiche (importée) : consolidation à la main */
export function ConsolidateImportedButton({ id, label, confirmText }: { id: number; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="btn-secondary" disabled={pending} onClick={async () => await appConfirm(confirmText) && start(async () => { await consolidateImportedAction(id); router.refresh(); })}>
      <Icon name="check" className="h-4 w-4" /> {label}
    </button>
  );
}

export function AddNote({ receptionId, placeholder, label }: { receptionId: number; placeholder: string; label: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="no-print space-y-2">
      <textarea className="input" rows={2} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      <button className="btn-primary" disabled={!text.trim() || pending} onClick={() => start(async () => { await addNoteAction(receptionId, text); setText(""); router.refresh(); })}>
        <Icon name="plus" className="h-4 w-4" /> {label}
      </button>
    </div>
  );
}

/** Champ « Actions » d'une anomalie du bon : c'est le champ « Action » du tableau Anomalies */
export function AnomalyActionField({ id, initial, editable, label, saveLabel, savedLabel, failedLabel = "Échec de l'enregistrement : réessayez." }: { id: number; initial: string; editable: boolean; label: string; saveLabel: string; savedLabel: string; failedLabel?: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  if (!editable) return initial ? <p className="mt-1 whitespace-pre-line text-xs text-stone-600"><strong>{label} :</strong> {initial}</p> : null;
  return (
    <div className="mt-1.5">
      <label className="text-xs font-semibold text-stone-600">{label}</label>
      <div className="mt-0.5 flex items-start gap-2">
        <textarea className="input min-h-0 py-1.5 text-sm" rows={Math.min(4, Math.max(1, v.split("\n").length))} value={v} onChange={(e) => { setV(e.target.value); setSaved(false); }} />
        <button
          type="button"
          className="btn-secondary shrink-0 py-1.5 text-sm"
          disabled={pending || v === initial}
          onClick={() => start(async () => {
            try { await updateAnomalyAction(id, { followUp: v, lastActionAt: new Date().toISOString().slice(0, 10) }); setFailed(false); setSaved(true); router.refresh(); }
            catch { setFailed(true); }
          })}
        >
          {saveLabel}
        </button>
      </div>
      {saved && !failed && <p className="text-xs text-emerald-700">{savedLabel}</p>}
      {failed && <p className="text-xs font-medium text-red-700">⚠ {failedLabel}</p>}
    </div>
  );
}
