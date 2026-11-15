"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

// Fenêtre de confirmation de l'application (remplace la boîte du navigateur).
// Usage : if (!(await appConfirm("Supprimer ?"))) return;
type Req = { message: string; danger: boolean; alertOnly: boolean; resolve: (v: boolean) => void };
let push: ((r: Req) => void) | null = null;

export function appConfirm(message: string, opts: { danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(message));
    push({ message, danger: opts.danger ?? true, alertOnly: false, resolve });
  });
}

export function appAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    if (!push) {
      window.alert(message);
      return resolve();
    }
    push({ message, danger: false, alertOnly: true, resolve: () => resolve() });
  });
}

export function ConfirmHost() {
  const { t } = useI18n();
  const [req, setReq] = useState<Req | null>(null);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    push = (r) => setReq(r);
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (req) ok.current?.focus();
  }, [req]);
  if (!req) return null;
  const close = (v: boolean) => {
    req.resolve(v);
    setReq(null);
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === "Escape" && close(false)}
      onClick={() => close(false)}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="whitespace-pre-line text-base text-stone-800">{req.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          {!req.alertOnly && (
            <button type="button" className="btn-secondary" onClick={() => close(false)}>
              {t.common.cancel}
            </button>
          )}
          <button ref={ok} type="button" className={req.danger && !req.alertOnly ? "btn-danger" : "btn-primary"} onClick={() => close(true)}>
            {req.alertOnly ? "OK" : t.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
