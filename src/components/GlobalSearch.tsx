"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "./Icon";

interface Hit { group: string; title: string; meta: string; href: string }

/**
 * Champ « Recherche » : les résultats s'affichent au fil de la saisie (fournisseurs, produits, réceptions,
 * anomalies, protocoles) ; « Rechercher » (ou Entrée) ouvre la page de résultats complète.
 */
export function GlobalSearch({ value = "", label, placeholder, button }: { value?: string; label: string; placeholder: string; button: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState(value);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(text)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((j) => setHits(j.results ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q]);
  const groups = t.search.groups as Record<string, string>;
  return (
    <form
      role="search"
      className="no-print mb-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        setOpen(false);
        router.push(`/recherche?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <div ref={box} className="relative flex-1">
        <label className="relative block">
          <span className="sr-only">{label}</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
          <input
            name="q"
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="input pl-10"
            placeholder={placeholder}
            autoComplete="off"
          />
        </label>
        {open && q.trim().length >= 2 && (
          <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-xl">
            {loading && hits.length === 0 && <p className="px-3 py-2 text-sm text-stone-500">{t.common.loading}</p>}
            {!loading && hits.length === 0 && <p className="px-3 py-2 text-sm text-stone-500">{t.search.none} « {q.trim()} »</p>}
            {hits.map((h, i) => (
              <div key={h.href + i}>
                {(i === 0 || hits[i - 1].group !== h.group) && <p className="px-3 pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">{groups[h.group] ?? h.group}</p>}
                <Link href={h.href} className="block px-3 py-1.5 hover:bg-brand-50" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
                  <span className="text-sm font-medium text-brand-700">{h.title}</span>
                  {h.meta && <span className="block truncate text-xs text-stone-500">{h.meta}</span>}
                </Link>
              </div>
            ))}
            {hits.length > 0 && (
              <button type="submit" className="mt-1 block w-full border-t border-stone-100 px-3 py-2 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50" onMouseDown={(e) => e.preventDefault()}>
                {t.search.allResults} « {q.trim()} » →
              </button>
            )}
          </div>
        )}
      </div>
      <button className="btn-primary">{button}</button>
    </form>
  );
}
