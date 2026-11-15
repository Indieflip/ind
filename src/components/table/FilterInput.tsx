"use client";
import { useMemo, useState } from "react";
import { suggest } from "@/lib/search";
import { useI18n } from "@/lib/i18n/client";

/**
 * Filtre d'en-tête de colonne : texte libre, suggestions (liste pré-enregistrée ou valeurs
 * de la colonne) au fil de la saisie, croix pour tout effacer d'un coup.
 */
export function FilterInput({ value, onChange, options = [], placeholder }: { value: string; onChange: (v: string) => void; options?: string[]; placeholder?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const list = useMemo(() => (value ? suggest(options, value, 8).filter((o) => o !== value) : []), [options, value]);
  return (
    <div className="relative min-w-20">
      <input
        className="input py-1 pl-2 pr-6 text-xs font-normal"
        value={value}
        placeholder={placeholder ?? t.table.filter}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
      />
      {value && (
        <button
          type="button"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-sm leading-none text-stone-400 hover:text-stone-700"
          aria-label={t.table.clear}
          title={t.table.clear}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
        >
          ×
        </button>
      )}
      {open && list.length > 0 && (
        <ul className="absolute left-0 z-30 mt-1 max-h-56 w-max min-w-full max-w-72 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 text-left text-xs font-normal normal-case shadow-lg">
          {list.map((o) => (
            <li key={o}>
              <button type="button" className="block w-full px-2.5 py-1.5 text-left hover:bg-brand-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(o); setOpen(false); }}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bouton « Réinitialiser » placé en bout de ligne de filtres */
export function ResetFilters({ onClick, active }: { onClick: () => void; active: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" className={`btn px-2 py-1 text-xs ${active ? "bg-stone-800 text-white hover:bg-stone-900" : "border border-stone-200 bg-white text-stone-400"}`} disabled={!active} onClick={onClick}>
      {t.table.reset}
    </button>
  );
}

/** Pagination : 1000 lignes par page par défaut */
export function Pager({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 bg-white px-3 py-2 text-xs text-stone-600">
      <span>
        {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={page === 0} onClick={() => onPage(page - 1)}>‹</button>
        {Array.from({ length: pages }, (_, i) => (
          <button key={i} type="button" className={`rounded-md px-2.5 py-1 font-semibold ${i === page ? "bg-brand-600 text-white" : "hover:bg-stone-100"}`} onClick={() => onPage(i)}>
            {i + 1}
          </button>
        ))}
        <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>›</button>
        <span className="ml-2">{t.table.page}</span>
      </div>
    </div>
  );
}
