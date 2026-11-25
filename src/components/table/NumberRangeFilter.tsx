"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/client";

/** Filtre d'en-tête d'une colonne de montants : minimum et / ou maximum (valeur « min~max ») */
export function NumberRangeFilter({ value, onChange, unit = "€" }: { value: string; onChange: (v: string) => void; unit?: string }) {
  const { t } = useI18n();
  const T = t.table;
  const [min, max] = value.split("~");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const h = pop.current?.offsetHeight ?? 150;
      const top = r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 232)), top });
    };
    requestAnimationFrame(place);
    const close = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", close);
    return () => { window.removeEventListener("scroll", place, true); document.removeEventListener("mousedown", close); };
  }, [open]);
  const set = (a?: string, b?: string) => onChange((a ?? "").trim() || (b ?? "").trim() ? `${(a ?? "").trim()}~${(b ?? "").trim()}` : "");
  const label = min && max ? `${min} – ${max} ${unit}` : min ? `≥ ${min} ${unit}` : max ? `≤ ${max} ${unit}` : "";
  return (
    <div className="relative min-w-0">
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} className={`flex min-h-[1.9rem] w-full items-center gap-1 rounded-lg border bg-white px-2 py-0.5 text-left text-xs font-normal ${label ? "border-brand-500 text-brand-800" : "border-stone-300 text-stone-400"}`}>
        <span className="truncate">{label || T.between}</span>
        {label && <span role="button" tabIndex={0} aria-label={T.clear} className="ml-auto px-0.5 text-stone-400 hover:text-stone-700" onClick={(e) => { e.stopPropagation(); onChange(""); }}>×</span>}
      </button>
      {open && pos && createPortal(
        <div ref={pop} style={{ position: "fixed", left: pos.left, top: pos.top }} className="z-50 w-56 space-y-2 rounded-xl border border-stone-200 bg-white p-3 text-sm shadow-lg">
          <div className="grid grid-cols-2 gap-2">
            <label><span className="text-xs text-stone-500">{T.min}</span><input className="input py-1 text-right text-sm" inputMode="decimal" value={min ?? ""} onChange={(e) => set(e.target.value, max)} /></label>
            <label><span className="text-xs text-stone-500">{T.max}</span><input className="input py-1 text-right text-sm" inputMode="decimal" value={max ?? ""} onChange={(e) => set(min, e.target.value)} /></label>
          </div>
          <div className="flex justify-between">
            <button type="button" className="text-xs text-stone-500 underline" onClick={() => { onChange(""); setOpen(false); }}>{T.clear}</button>
            <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => setOpen(false)}>OK</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
