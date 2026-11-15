"use client";
import { appConfirm } from "@/components/Confirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consolidateAction, addNoteAction } from "@/lib/actions/consolidation";
import { deleteReceptionAction } from "@/lib/actions/receptions";
import { Icon } from "@/components/Icon";

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

export function ConsolidateOneButton({ id, label, confirmText }: { id: number; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="btn-secondary" disabled={pending} onClick={async () => await appConfirm(confirmText) && start(async () => { await consolidateAction([id]); router.refresh(); })}>
      <Icon name="layers" className="h-4 w-4" /> {label}
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
