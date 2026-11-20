"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { FilterInput, Pager, ResetFilters } from "./FilterInput";
import { useTable, type ColumnDef } from "./useTable";
import { RowMenu, type RowAction } from "./RowMenu";
import { sentence } from "@/lib/format";

/** Colonnes dont le texte reste tel quel : produits du mercurial, références, numéros */
const KEEP = new Set(["product", "products", "name", "item", "reference", "bl", "number", "id"]);
import type { RowFields } from "@/lib/client/rowClipboard";

export interface Col<R> extends ColumnDef<R> {
  label: string;
  align?: "right" | "center";
  className?: string;
  render?: (r: R) => React.ReactNode;
  href?: (r: R) => string | null;
  sortable?: boolean;
  /** Garder le texte tel quel (produits du mercurial, références) ; sinon : première lettre en majuscule */
  keepCase?: boolean;
  /** Largeur de la colonne (tableau à largeur fixe), ex. "8%" */
  width?: string;
  /** Petit bouton dans l'en-tête de la colonne (ex. afficher / masquer une colonne voisine) */
  headerAction?: React.ReactNode;
}

/** En-tête triable (▲ A→Z / ▼ Z→A) */
export function SortTh({ label, active, dir, onClick, align, action }: { label: string; active: boolean; dir?: "asc" | "desc"; onClick: () => void; align?: "right" | "center"; action?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <th className={align === "right" ? "text-right" : align === "center" ? "text-center" : ""}>
      <button type="button" onClick={onClick} className={`inline-flex items-start gap-1 text-left hover:text-stone-900 ${align === "right" ? "flex-row-reverse text-right" : ""}`} title={active && dir === "asc" ? t.receptions.sortDesc : t.receptions.sortAsc}>
        {label}
        <span className={`text-[10px] ${active ? "text-brand-600" : "text-stone-300"}`}>{active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </button>
      {action}
    </th>
  );
}

/**
 * Tableau générique : en-têtes triables, ligne de filtres (suggestions, croix, Réinitialiser),
 * pagination à 1000 lignes. Option de sélection de lignes avec actions groupées.
 */
export function DataTable<R>({
  rows,
  cols,
  rowKey,
  empty,
  pageSize,
  defaultSort,
  selectable,
  selection,
  onSelectionChange,
  rowClassName,
  maxHeight = "max-h-[75vh]",
  dense,
  fixed,
  copy,
  mergedHeader,
}: {
  rows: R[];
  cols: Col<R>[];
  rowKey: (r: R) => string | number;
  empty?: string;
  pageSize?: number;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  selectable?: boolean;
  selection?: Set<string | number>;
  onSelectionChange?: (s: Set<string | number>) => void;
  rowClassName?: (r: R) => string;
  maxHeight?: string;
  /** Texte plus petit pour les tableaux à nombreuses colonnes */
  dense?: boolean;
  /** Colonnes de largeur fixe (Col.width) : le tableau tient dans la page, le texte passe à la ligne */
  fixed?: boolean;
  /** Menu ⋮ : champs de la ligne à copier (pour la coller dans un autre tableau) et actions de la ligne */
  copy?: { source: string; fields: (r: R) => RowFields; actions?: (r: R) => RowAction[] };
  /** En-tête sur une seule ligne : le titre de la colonne est dans le champ de filtre, avec le tri à côté */
  mergedHeader?: boolean;
}) {
  const { t } = useI18n();
  const tb = useTable(rows, cols, { pageSize, defaultSort });
  const sel = selection ?? new Set<string | number>();
  const allOn = tb.filtered.length > 0 && tb.filtered.every((r) => sel.has(rowKey(r)));
  return (
    <div className="card overflow-hidden">
      <div className={`${maxHeight} min-h-48 overflow-auto`}>
        <table className={`table ${dense ? "text-xs [&_th]:text-xs" : ""} ${fixed ? "table-fixed [&_td]:break-words [&_td]:px-1.5 [&_th]:px-1.5 [&_thead_tr:first-child_th]:whitespace-normal [&_thead_tr:first-child_th]:text-left [&_thead_tr:first-child_th]:align-top [&_thead_tr:first-child_th]:font-bold [&_thead_tr:first-child_th]:text-stone-800" : ""}`}>
          {(fixed || cols.some((c) => c.width)) && (
            <colgroup>
              {selectable && <col style={{ width: "2rem" }} />}
              {cols.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
              <col style={{ width: "2rem" }} />
            </colgroup>
          )}
          {mergedHeader ? (
            <thead className="sticky top-0 z-10">
              <tr>
                {selectable && <th className="w-8 bg-white" />}
                {cols.map((c) => (
                  <th key={c.key} className="bg-white py-1.5 align-bottom">
                    <div className={`mb-0.5 truncate text-[11px] font-semibold text-stone-600 ${c.align === "right" ? "text-right" : ""}`}>{c.label}</div>
                    <div className={`flex items-center gap-1 ${c.align === "right" ? "flex-row-reverse" : ""}`}>
                      <div className="min-w-[5.5rem] flex-1">
                        {c.filterable !== false ? (
                          <FilterInput value={tb.filters[c.key] ?? ""} onChange={(v) => tb.setFilter(c.key, v)} options={c.keepCase || KEEP.has(c.key) ? tb.options[c.key] : [...new Set((tb.options[c.key] ?? []).map(sentence))]} />
                        ) : null}
                      </div>
                      {c.sortable !== false && (
                        <button type="button" onClick={() => tb.toggleSort(c.key)} className={`text-[10px] ${tb.sort?.key === c.key ? "text-brand-600" : "text-stone-300 hover:text-stone-500"}`} title={tb.sort?.key === c.key && tb.sort?.dir === "asc" ? t.receptions.sortDesc : t.receptions.sortAsc}>
                          {tb.sort?.key === c.key ? (tb.sort.dir === "asc" ? "▲" : "▼") : "▲▼"}
                        </button>
                      )}
                      {c.headerAction}
                    </div>
                  </th>
                ))}
                <th className="bg-white py-1.5 text-right"><ResetFilters onClick={tb.reset} active={tb.active} compact /></th>
              </tr>
            </thead>
          ) : (
          <thead className="sticky top-0 z-10">
            <tr>
              {selectable && (
                <th className="w-8">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={allOn}
                    aria-label={t.consolidation.selectAll}
                    onChange={() => onSelectionChange?.(allOn ? new Set() : new Set(tb.filtered.map(rowKey)))}
                  />
                </th>
              )}
              {cols.map((c) =>
                c.sortable === false ? (
                  <th key={c.key} className={c.align === "right" && !fixed ? "text-right" : ""}>{c.label}</th>
                ) : (
                  <SortTh key={c.key} label={c.label} align={fixed ? undefined : c.align} active={tb.sort?.key === c.key} dir={tb.sort?.dir} onClick={() => tb.toggleSort(c.key)} action={c.headerAction} />
                ),
              )}
              <th className="w-px" />
            </tr>
            <tr>
              {selectable && <th className="bg-white" />}
              {cols.map((c) => (
                <th key={c.key} className="bg-white py-1.5">
                  {c.filterable !== false && <FilterInput value={tb.filters[c.key] ?? ""} onChange={(v) => tb.setFilter(c.key, v)} options={c.keepCase || KEEP.has(c.key) ? tb.options[c.key] : [...new Set((tb.options[c.key] ?? []).map(sentence))]} />}
                </th>
              ))}
              <th className="bg-white py-1.5 text-right">
                <ResetFilters onClick={tb.reset} active={tb.active} compact={fixed} />
              </th>
            </tr>
          </thead>
          )}
          <tbody>
            {tb.pageRows.length === 0 && (
              <tr><td colSpan={cols.length + 2} className="py-8 text-center text-stone-500">{empty ?? t.table.empty}</td></tr>
            )}
            {tb.pageRows.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} className={`${sel.has(k) ? "bg-brand-50/60" : "hover:bg-stone-50"} ${rowClassName?.(r) ?? ""}`}>
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={sel.has(k)}
                        onChange={() => {
                          const n = new Set(sel);
                          if (n.has(k)) n.delete(k);
                          else n.add(k);
                          onSelectionChange?.(n);
                        }}
                      />
                    </td>
                  )}
                  {cols.map((c) => {
                    const keep = c.keepCase || KEEP.has(c.key);
                    const content = c.render ? c.render(r) : (keep ? c.text(r) : sentence(c.text(r))) || "—";
                    const href = c.href?.(r);
                    return (
                      <td key={c.key} className={`${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""} ${c.className ?? ""}`}>
                        {href ? <Link href={href} className="font-medium text-brand-700 hover:underline">{content}</Link> : content}
                      </td>
                    );
                  })}
                  <td className="px-0 text-right">{copy && <RowMenu source={copy.source} fields={copy.fields(r)} actions={copy.actions?.(r)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={tb.page} pages={tb.pages} total={tb.filtered.length} pageSize={tb.pageSize} onPage={tb.setPage} />
    </div>
  );
}
