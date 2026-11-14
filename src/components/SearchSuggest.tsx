"use client";
import { useMemo, useRef, useState } from "react";
import { suggest } from "@/lib/search";
import { Icon } from "./Icon";

/**
 * Champ de recherche avec suggestions tirées du mercurial (produits, fournisseurs…).
 * Insensible aux accents, majuscules et ponctuation. Choisir une suggestion remplit le champ
 * et soumet le formulaire parent.
 */
export function SearchSuggest({
  name = "q",
  defaultValue = "",
  options,
  placeholder,
  className = "input py-2 pl-9",
  submitOnPick = true,
  onValueChange,
}: {
  name?: string;
  defaultValue?: string;
  options: string[];
  placeholder?: string;
  className?: string;
  submitOnPick?: boolean;
  /** Filtrage en direct (sans formulaire) */
  onValueChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const list = useMemo(() => suggest(options, value), [options, value]);

  const pick = (v: string) => {
    setValue(v);
    onValueChange?.(v);
    setOpen(false);
    if (submitOnPick) setTimeout(() => ref.current?.form?.requestSubmit(), 0);
  };

  return (
    <div className="relative">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        ref={ref}
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        onChange={(e) => { setValue(e.target.value); onValueChange?.(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" && list[hi] && normalizeEq(list[hi], value) === false) { e.preventDefault(); pick(list[hi]); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && list.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {list.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`block w-full px-3 py-2 text-left text-sm ${i === hi ? "bg-brand-50 text-brand-700" : "hover:bg-stone-50"}`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function normalizeEq(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
