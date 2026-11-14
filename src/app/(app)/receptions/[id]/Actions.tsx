"use client";
import { useTransition } from "react";
import { deleteReceptionAction } from "@/lib/actions/receptions";
import { Icon } from "@/components/Icon";

export function PrintButton({ label }: { label: string }) {
  return <button className="btn-secondary" onClick={() => window.print()}><Icon name="print" className="h-4 w-4" /> {label}</button>;
}

export function DeleteReceptionButton({ id, label, confirmText }: { id: number; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost text-red-600" disabled={pending} onClick={() => confirm(confirmText) && start(() => deleteReceptionAction(id))}>
      <Icon name="trash" className="h-4 w-4" /> {label}
    </button>
  );
}
