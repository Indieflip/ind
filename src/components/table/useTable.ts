"use client";
import { useMemo, useState } from "react";
import { matches } from "@/lib/search";

export interface ColumnDef<R> {
  key: string;
  /** Texte utilisé pour filtrer (et suggérer) */
  text: (r: R) => string;
  /** Valeur de tri (nombre, date ISO, texte) ; par défaut le texte */
  sort?: (r: R) => string | number | null | undefined;
  /** Liste pré-enregistrée de suggestions ; par défaut les valeurs de la colonne */
  options?: string[];
  filterable?: boolean;
}

const coll = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Filtres par colonne + tri A→Z / Z→A + pagination, côté navigateur */
export function useTable<R>(rows: R[], cols: ColumnDef<R>[], opts: { pageSize?: number; defaultSort?: { key: string; dir: "asc" | "desc" } } = {}) {
  const pageSize = opts.pageSize ?? 1000;
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(opts.defaultSort ?? null);
  const [page, setPage] = useState(0);

  const options = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of cols) {
      if (c.options) o[c.key] = c.options;
      else {
        const set = new Set<string>();
        for (const r of rows) {
          const v = c.text(r);
          if (v) set.add(v);
          if (set.size > 2000) break;
        }
        o[c.key] = [...set];
      }
    }
    return o;
  }, [rows, cols]);

  const filtered = useMemo(() => {
    // Plusieurs choix séparés par « | » : la ligne correspond si elle correspond à l'un d'eux.
    // Une valeur choisie dans la liste (étiquette, ex. l'unité « Sac ») est cherchée telle quelle : « Sac » ne ramène pas « Sachet ».
    // Le texte en cours de saisie (après le dernier « | ») reste une recherche approchée.
    const terms = Object.fromEntries(
      cols.map((c) => {
        const parts = (filters[c.key] ?? "").split("|");
        return [c.key, parts.map((q, i) => ({ q: q.trim(), exact: i < parts.length - 1 })).filter((x) => x.q)];
      }),
    );
    const hit = (text: string, t: { q: string; exact: boolean }) => (t.exact ? text.trim().toLowerCase() === t.q.toLowerCase() : matches(text, t.q));
    let out = rows.filter((r) => cols.every((c) => !terms[c.key].length || terms[c.key].some((t) => hit(c.text(r), t))));
    if (sort) {
      const c = cols.find((x) => x.key === sort.key);
      if (c) {
        const get = c.sort ?? c.text;
        const m = sort.dir === "desc" ? -1 : 1;
        out = [...out].sort((a, b) => {
          const x = get(a), y = get(b);
          if (x == null || x === "") return y == null || y === "" ? 0 : 1;
          if (y == null || y === "") return -1;
          if (typeof x === "number" && typeof y === "number") return (x - y) * m;
          return coll.compare(String(x), String(y)) * m;
        });
      }
    }
    return out;
  }, [rows, cols, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  return {
    filters,
    setFilter: (key: string, v: string) => { setFilters((f) => ({ ...f, [key]: v })); setPage(0); },
    reset: () => { setFilters({}); setPage(0); },
    active: Object.values(filters).some((v) => v.replace(/\|/g, "").trim() !== ""),
    sort,
    toggleSort: (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" })),
    options,
    filtered,
    pageRows: filtered.slice(safePage * pageSize, (safePage + 1) * pageSize),
    page: safePage,
    pages,
    pageSize,
    setPage,
  };
}
