"use client";
import { DataTable, type Col } from "@/components/table/DataTable";
import { COMPETITORS, type Competitor } from "./competitors";

const COLS: [keyof Competitor, string, string][] = [
  ["cat", "Catégorie", "9%"], ["name", "Solution", "10%"], ["price", "Prix (HT / mois / site)", "10%"], ["reception", "Fonctions de réception", "14%"],
  ["haccp", "HACCP", "8%"], ["cmp", "Commande / BL / facture", "7%"], ["stock", "Stock et coût matière", "6%"], ["ddpp", "Export DDPP", "7%"],
  ["offline", "Hors ligne", "5%"], ["other", "Autres fonctions", "11%"], ["pros", "Avantages", "10%"], ["cons", "Inconvénients / limites", "11%"], ["target", "Cible", "8%"],
];

/** Comparatif des solutions de réception : notre application en tête, filtres et tri sur chaque colonne */
export function CompetitorsTable() {
  const ours = (r: Competitor) => r.cat.startsWith("★");
  const cols: Col<Competitor>[] = COLS.map(([key, label, width]) => ({
    key, label, width, keepCase: true,
    text: (r) => r[key],
    options: key === "cat" ? [...new Set(COMPETITORS.map((r) => r.cat))] : undefined,
    className: key === "name" ? "font-semibold" : "text-stone-700",
  }));
  return (
    <DataTable
      rows={COMPETITORS}
      cols={cols}
      rowKey={(r) => r.name}
      dense
      fixed
      maxHeight="max-h-[70vh]"
      rowClassName={(r) => (ours(r) ? "bg-amber-50 font-medium" : r.cat.startsWith("Appli") ? "bg-sky-50/40" : r.cat.startsWith("Gestion") ? "bg-emerald-50/40" : "")}
    />
  );
}
