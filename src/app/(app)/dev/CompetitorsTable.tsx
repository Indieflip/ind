"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCompetitorsAction } from "@/lib/actions/dev";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";
import type { Competitor } from "./competitors";

const COLS: [keyof Competitor, string, string][] = [
  ["cat", "Catégorie", "9%"], ["name", "Solution", "10%"], ["price", "Prix (HT / mois / site)", "10%"], ["reception", "Fonctions de réception", "13%"],
  ["haccp", "HACCP", "8%"], ["cmp", "Commande / BL / facture", "7%"], ["stock", "Stock et coût matière", "6%"], ["ddpp", "Export DDPP", "7%"],
  ["offline", "Hors ligne", "5%"], ["other", "Autres fonctions", "10%"], ["pros", "Avantages", "10%"], ["cons", "Inconvénients / limites", "10%"], ["target", "Cible", "7%"],
];
const FIELDS: [keyof Competitor, string][] = [["cat", "Catégorie"], ["name", "Solution *"], ["url", "Lien (site du fournisseur)"], ...COLS.filter(([k]) => k !== "cat" && k !== "name").map(([k, l]) => [k, l] as [keyof Competitor, string])];

type Row = Competitor & { _i: number };

/** Comparatif des solutions de réception : filtres et tri ; chaque ligne se modifie, s'ajoute ou se supprime */
export function CompetitorsTable({ rows: initial }: { rows: Competitor[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<Competitor[]>(initial);
  const [edit, setEdit] = useState<{ i: number | null; v: Competitor } | null>(null);
  const [pending, start] = useTransition();
  const persist = (next: Competitor[]) => start(async () => { setRows(next); await saveCompetitorsAction(next as unknown as Record<string, string>[]); router.refresh(); });
  const empty: Competitor = { cat: "", name: "", url: "", price: "", reception: "", haccp: "", cmp: "", stock: "", ddpp: "", offline: "", other: "", pros: "", cons: "", target: "" };

  const cols: Col<Row>[] = [
    ...COLS.map(([key, label, width]) => ({
      key, label, width, keepCase: true,
      text: (r: Row) => String(r[key] ?? ""),
      options: key === "cat" ? [...new Set(rows.map((r) => r.cat).filter(Boolean))] : undefined,
      className: key === "name" ? "font-semibold" : "text-stone-700",
      render: key === "name" ? (r: Row) => (r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{r.name} ↗</a> : r.name) : undefined,
    }) as Col<Row>),
    {
      key: "actions", label: "", sortable: false, width: "4%", text: () => "",
      render: (r: Row) => (
        <span className="flex flex-col gap-0.5">
          <button type="button" className="btn-ghost p-1" title={t.common.edit} onClick={() => setEdit({ i: r._i, v: { ...empty, ...rows[r._i] } })}><Icon name="edit" className="h-3.5 w-3.5" /></button>
          <button type="button" className="btn-ghost p-1 text-stone-400 hover:text-red-600" title={t.common.delete} onClick={async () => { if (await appConfirm(`${t.common.delete} « ${r.name} » ?`)) persist(rows.filter((_, j) => j !== r._i)); }}><Icon name="trash" className="h-3.5 w-3.5" /></button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => setEdit({ i: null, v: { ...empty, cat: "Gestion de restaurant" } })}><Icon name="plus" className="h-4 w-4" /> {t.common.add}</button>
      </div>
      {edit && (
        <div className="card grid gap-2 border-brand-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map(([k, label]) => (
            <label key={k} className={k === "reception" || k === "other" || k === "pros" || k === "cons" ? "sm:col-span-2 lg:col-span-1" : ""}>
              <span className="label">{label}</span>
              {k === "name" || k === "cat" || k === "url" || k === "offline" ? (
                <input className="input py-1.5 text-sm" value={edit.v[k] ?? ""} placeholder={k === "url" ? "https://…" : undefined} list={k === "cat" ? "competitor-cats" : undefined} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, [k]: e.target.value } })} />
              ) : (
                <textarea className="input py-1.5 text-sm" rows={2} value={edit.v[k] ?? ""} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, [k]: e.target.value } })} />
              )}
            </label>
          ))}
          <datalist id="competitor-cats">{[...new Set(rows.map((r) => r.cat).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button type="button" className="btn-primary" disabled={pending || !edit.v.name.trim()} onClick={() => {
              const url = edit.v.url?.trim() ? (/^https?:\/\//i.test(edit.v.url.trim()) ? edit.v.url.trim() : `https://${edit.v.url.trim()}`) : "";
              const v = { ...edit.v, url };
              persist(edit.i == null ? [...rows, v] : rows.map((x, j) => (j === edit.i ? v : x)));
              setEdit(null);
            }}>{t.common.save}</button>
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>{t.common.cancel}</button>
          </div>
        </div>
      )}
      <DataTable
        rows={rows.map((r, i) => ({ ...r, _i: i }))}
        cols={cols}
        rowKey={(r) => r._i}
        dense
        fixed
        maxHeight="max-h-[70vh]"
        rowClassName={(r) => (r.cat.startsWith("★") ? "bg-amber-50 font-medium" : "")}
      />
    </div>
  );
}
