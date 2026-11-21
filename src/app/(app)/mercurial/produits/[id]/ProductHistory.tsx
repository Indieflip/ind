"use client";
import { useI18n } from "@/lib/i18n/client";
import { DataTable, type Col } from "@/components/table/DataTable";

export interface HistoryRow { id: string; date: string; dateLabel: string; nature: string; detail: string; href: string | null; tone: string }

/** Compte produit : tout l'historique dans un seul tableau (création, prix, mises à jour du Mercurial, anomalies, réceptions), lignes cliquables */
export function ProductHistory({ rows }: { rows: HistoryRow[] }) {
  const { t } = useI18n();
  const P = t.productPage;
  const cols: Col<HistoryRow>[] = [
    { key: "date", label: P.date, width: "6.5rem", text: (r) => r.dateLabel, sort: (r) => r.date, date: (r) => r.date.slice(0, 10), className: "whitespace-nowrap" },
    { key: "nature", label: P.nature, width: "11rem", text: (r) => r.nature, keepCase: true, render: (r) => <span className={`badge ${r.tone}`}>{r.nature}</span> },
    { key: "detail", label: P.historyDetail, text: (r) => r.detail, keepCase: true, href: (r) => r.href },
  ];
  return <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} defaultSort={{ key: "date", dir: "desc" }} dense empty={P.none} />;
}
