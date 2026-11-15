"use client";
import { useEffect, useRef, useState } from "react";
import { copyRow, clearRow, useCopiedRow, type RowFields } from "@/lib/client/rowClipboard";
import { useI18n } from "@/lib/i18n/client";
import { appAlert, appConfirm } from "../Confirm";

export interface RowAction { label: string; onClick: () => void }

/** Menu ⋮ d'une ligne : copier la ligne (pour la coller dans un autre tableau) + actions propres au tableau */
export function RowMenu({ source, fields, actions = [] }: { source: string; fields: RowFields; actions?: RowAction[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // Le focus du bouton peut faire défiler le tableau : on ignore ce premier défilement
    const since = Date.now();
    const close = () => { if (Date.now() - since > 400) setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="rounded px-1 py-0.5 text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        aria-label={t.rowMenu.title}
        title={t.rowMenu.title}
        onClick={() => {
          const r = btn.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 220) });
          setOpen((o) => !o);
        }}
      >
        ⋮
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <ul className="fixed z-[81] w-56 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 text-sm shadow-lg" style={{ top: pos.top, left: pos.left }}>
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-stone-50"
                onClick={async () => {
                  copyRow(source, fields);
                  setOpen(false);
                  await appAlert(t.rowMenu.copied);
                }}
              >
                📋 {t.rowMenu.copy}
              </button>
            </li>
            {actions.map((a) => (
              <li key={a.label}>
                <button type="button" className="w-full px-3 py-2 text-left hover:bg-stone-50" onClick={() => { setOpen(false); a.onClick(); }}>{a.label}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * Bouton « Coller la ligne copiée » : propose de remplir automatiquement le formulaire du tableau
 * (confirmation demandée) ; l'utilisateur peut tout modifier avant d'enregistrer.
 */
export function PasteRowButton({ onPaste, className = "" }: { onPaste: (fields: RowFields) => void; className?: string }) {
  const { t } = useI18n();
  const row = useCopiedRow();
  if (!row) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        className="btn-secondary border-dashed py-1.5 text-sm"
        title={`${t.rowMenu.from} ${row.source}`}
        onClick={async () => {
          if (!(await appConfirm(`${t.rowMenu.pasteConfirm}\n(${t.rowMenu.from} ${row.source})`, { danger: false }))) return;
          onPaste(row.fields);
        }}
      >
        📋 {t.rowMenu.paste}
      </button>
      <button type="button" className="px-1 text-stone-400 hover:text-red-600" title={t.rowMenu.forget} aria-label={t.rowMenu.forget} onClick={clearRow}>✕</button>
    </span>
  );
}
