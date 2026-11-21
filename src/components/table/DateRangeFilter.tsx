"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/client";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = (v: string) => (v ? v.split("-").reverse().map((x, i) => (i === 2 ? x.slice(2) : x)).join("/") : "");

/**
 * Modèle « période » (filtre d'en-tête d'une colonne date, ou sélecteur de période d'une page) : calendrier (un jour, ou du … au …) et périodes rapides.
 * Valeur « AAAA-MM-JJ~AAAA-MM-JJ » (l'une des bornes peut être vide).
 */
export function DateRangeFilter({ value, onChange, large = false }: { value: string; onChange: (v: string) => void; large?: boolean }) {
  const { t } = useI18n();
  const T = t.table;
  const [from, to] = value.split("~");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Toujours dans l'écran : ouvert vers le haut quand il manque de place en dessous
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const h = pop.current?.offsetHeight ?? 290;
      const below = r.bottom + 4;
      const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), top });
    };
    requestAnimationFrame(place);
    place();
    const close = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", close);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); document.removeEventListener("mousedown", close); };
  }, [open]);
  const set = (f?: string, tt?: string) => onChange(f || tt ? `${f ?? ""}~${tt ?? ""}` : "");
  const now = new Date();
  const quick: [string, string, string][] = [
    [T.today, iso(now), iso(now)],
    [T.last7, iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), iso(now)],
    [T.thisMonth, iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))],
    [T.lastMonth, iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))],
    [T.thisYear, `${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`],
  ];
  const label = from && to && from === to ? short(from) : from || to ? `${short(from) || "…"} → ${short(to) || "…"}` : "";
  return (
    <div className="relative min-w-0">
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} className={`flex w-full items-center gap-1 rounded-lg border bg-white text-left font-normal ${large ? "min-h-[2.5rem] px-3 py-1.5 text-sm" : "min-h-[1.9rem] px-2 py-0.5 text-xs"} ${label ? "border-brand-500 text-brand-800" : "border-stone-300 text-stone-400"}`}>
        <span aria-hidden="true">📅</span>
        <span className="truncate">{label || T.period}</span>
        {label && <span role="button" tabIndex={0} aria-label={T.clear} className="ml-auto px-0.5 text-stone-400 hover:text-stone-700" onClick={(e) => { e.stopPropagation(); onChange(""); }}>×</span>}
      </button>
      {open && pos && createPortal(
        <div ref={pop} style={{ position: "fixed", left: pos.left, top: pos.top }} className="z-50 w-72 space-y-2 rounded-xl border border-stone-200 bg-white p-3 text-sm shadow-lg">
          <div className="flex flex-wrap gap-1">
            {quick.map(([l, f, tt]) => (
              <button key={l} type="button" onClick={() => { set(f, tt); setOpen(false); }} className={`rounded-md px-2 py-1 text-xs font-medium ${from === f && to === tt ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>{l}</button>
            ))}
          </div>
          <label className="block"><span className="text-xs text-stone-500">{T.dayOrFrom}</span><input type="date" className="input py-1 text-sm" value={from ?? ""} onChange={(e) => set(e.target.value, to && to >= e.target.value ? to : e.target.value)} /></label>
          <label className="block"><span className="text-xs text-stone-500">{T.to}</span><input type="date" className="input py-1 text-sm" value={to ?? ""} min={from || undefined} onChange={(e) => set(from, e.target.value)} /></label>
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
