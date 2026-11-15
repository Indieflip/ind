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
  // Plusieurs choix possibles : « choix 1|choix 2|texte en cours »
  const parts = value.split("|");
  const chips = parts.slice(0, -1).filter(Boolean);
  const text = parts[parts.length - 1] ?? "";
  const set = (c: string[], txt: string) => onChange([...c, txt].join("|").replace(/^\|$/, ""));
  const list = useMemo(() => {
    const pool = options.filter((o) => !chips.includes(o));
    // Sans saisie : toute la liste (défilante) ; en tapant : les correspondances
    return text ? suggest(pool, text, 50) : open ? pool.slice(0, 300) : [];
  }, [options, text, chips, open]);
  return (
    <div className="relative min-w-0">
      <div className="flex min-h-[1.9rem] flex-wrap items-center gap-1 rounded-lg border border-stone-300 bg-white py-0.5 pl-1 pr-6 focus-within:border-brand-500">
        {chips.map((c, i) => (
          <span key={c} className="inline-flex max-w-full items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
            <span className="truncate">{c}</span>
            <button type="button" className="leading-none text-brand-700/70 hover:text-brand-900" aria-label={t.table.clear} onClick={() => set(chips.filter((_, j) => j !== i), text)}>×</button>
          </span>
        ))}
        <input
          size={1}
          className="w-0 min-w-8 flex-1 bg-transparent px-1 py-0.5 text-xs font-normal outline-none"
          value={text}
          placeholder={chips.length ? "" : placeholder ?? t.table.filter}
          onChange={(e) => { set(chips, e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onChange("");
            if (e.key === "Backspace" && !text && chips.length) set(chips.slice(0, -1), "");
          }}
        />
      </div>
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
        <ul className="absolute left-0 z-30 mt-1 max-h-64 w-max min-w-full max-w-72 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 text-left text-xs font-normal normal-case shadow-lg">
          {list.map((o) => (
            <li key={o}>
              {/* Choisir une valeur l'ajoute (sélection multiple) */}
              <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-brand-50" onMouseDown={(e) => e.preventDefault()} onClick={() => set([...chips, o], "")}>
                <span className="h-3 w-3 rounded border border-stone-300" />
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
    <button type="button" className={`btn px-1.5 py-1 text-[11px] ${active ? "bg-stone-800 text-white hover:bg-stone-900" : "border border-stone-200 bg-white text-stone-400"}`} disabled={!active} onClick={onClick}>
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

/** Résultat du filtrage : nombre de lignes et filtres actifs (cliquer × pour en retirer un) */
export function ActiveFilters({
  filters,
  labels,
  onChange,
  onReset,
  count,
  total,
  unit,
}: {
  filters: Record<string, string>;
  labels: Record<string, string>;
  onChange: (key: string, v: string) => void;
  onReset: () => void;
  count: number;
  total: number;
  unit?: string;
}) {
  const { t } = useI18n();
  const active = Object.entries(filters).flatMap(([k, v]) =>
    v.split("|").map((x) => x.trim()).filter(Boolean).map((term) => ({ k, term, all: v })),
  );
  if (!active.length) return null;
  const remove = (k: string, term: string, all: string) =>
    onChange(k, all.split("|").filter((x) => x.trim() !== term).join("|").replace(/^\|+|\|+$/g, ""));
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50 px-3 py-2 text-sm">
      <strong className="text-brand-800">{count} {unit ?? t.table.results}</strong>
      <span className="text-xs text-stone-500">/ {total}</span>
      <span className="text-stone-300">|</span>
      {active.map(({ k, term, all }) => (
        <span key={k + term} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-2 py-0.5 text-xs">
          <span className="text-stone-500">{labels[k] ?? k} :</span>
          <strong className="text-stone-800">{term}</strong>
          <button type="button" className="text-stone-400 hover:text-red-600" aria-label={t.table.clear} onClick={() => remove(k, term, all)}>×</button>
        </span>
      ))}
      <button type="button" className="ml-auto text-xs font-semibold text-brand-700 underline" onClick={onReset}>{t.table.reset}</button>
    </div>
  );
}
