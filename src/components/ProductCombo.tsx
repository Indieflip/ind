"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { suggest } from "@/lib/search";

/**
 * Champ produit : on tape librement, une courte liste (8 au plus) propose les produits correspondants,
 * juste sous le champ (la saisie reste visible). Flèches ↑ ↓ + Entrée pour choisir, Échap pour fermer.
 * Sans choix dans la liste, le texte tapé est gardé tel quel (produit hors liste).
 */
export function ProductCombo({ value, products, onChange, disabled, placeholder, className = "" }: {
  value: string;
  products: { id: number; name: string; unit?: string }[];
  onChange: (name: string, product: { id: number; name: string; unit?: string } | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const names = useMemo(() => products.map((p) => p.name), [products]);
  const list = useMemo(() => (value.trim() ? suggest(names, value, 8) : names.slice(0, 8)), [names, value]);
  const byName = (n: string) => products.find((p) => p.name === n) ?? null;

  // La liste suit le champ (position fixe : elle n'est pas coupée par le tableau qui défile)
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = ref.current?.getBoundingClientRect(); if (r) setBox({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 260) }); };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  const pick = (n: string) => { onChange(n, byName(n)); setOpen(false); };
  return (
    <>
      <input
        ref={ref}
        className={`input py-1.5 text-sm ${className}`}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={(e) => { const n = e.target.value; onChange(n, products.find((p) => p.name.toLowerCase() === n.trim().toLowerCase()) ?? null); setActive(0); setOpen(true); }}
        onFocus={() => { setActive(0); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && open && list[active]) { e.preventDefault(); pick(list[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && box && list.length > 0 && typeof document !== "undefined" && createPortal(
        <ul role="listbox" style={{ position: "fixed", left: box.left, top: box.top, width: box.width }} className="z-50 max-h-60 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {list.map((n, i) => {
            const p = byName(n);
            return (
              <li key={n} role="option" aria-selected={i === active}>
                <button type="button" className={`flex w-full justify-between gap-2 px-3 py-1.5 text-left text-sm ${i === active ? "bg-brand-50 text-brand-800" : "hover:bg-stone-50"}`} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(n)}>
                  <span>{n}</span>{p?.unit && <span className="shrink-0 text-xs text-stone-400">{p.unit}</span>}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </>
  );
}
