"use client";
import { useEffect, useState } from "react";

/**
 * Bandeau d'information refermable (✕). Refermé, il reste caché jusqu'au lendemain,
 * ou jusqu'à ce que son contenu change (ex. le nombre de réclamations à relancer).
 */
export function Notice({ id, version, className, children, closeLabel }: { id: string; version: string | number; className: string; children: React.ReactNode; closeLabel: string }) {
  const key = `rm_notice_${id}`;
  const stamp = `${new Date().toISOString().slice(0, 10)}|${version}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(key) === stamp); } catch { setHidden(false); }
  }, [key, stamp]);
  if (hidden) return null;
  return (
    <div className={`no-print relative flex flex-wrap items-center justify-center gap-2 border-b px-10 py-2 text-center text-sm ${className}`}>
      {children}
      <button
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-base leading-none opacity-60 hover:bg-black/5 hover:opacity-100"
        onClick={() => { try { localStorage.setItem(key, stamp); } catch { /* */ } setHidden(true); }}
      >
        ✕
      </button>
    </div>
  );
}
