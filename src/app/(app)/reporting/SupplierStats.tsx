"use client";
import { useI18n } from "@/lib/i18n/client";
import { fmtPct } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

interface Row { supplier: string; receptions: number; lines: number; pct: number | null; conform: number; reserves: number; refusals: number; anomalies: number; increases: number; avg: number | null }

export function SupplierStats({ rows }: { rows: Row[] }) {
  const { t } = useI18n();
  const r_ = t.reporting;
  const n = (k: keyof Row, label: string): Col<Row> => ({ key: k, label, align: "right", text: (r) => String(r[k] ?? ""), sort: (r) => r[k] as number, filterable: false });
  const cols: Col<Row>[] = [
    { key: "supplier", label: t.common.supplier, text: (r) => r.supplier, className: "font-medium" },
    n("receptions", r_.receptions),
    n("lines", r_.lines),
    {
      key: "pct", label: r_.conformity, text: (r) => (r.pct == null ? "" : `${r.pct} %`), sort: (r) => r.pct, className: "min-w-24",
      render: (r) => r.pct == null ? "—" : (
        <div className="flex items-center gap-2" title={`${r.conform} / ${r.lines}`}>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${r.pct}%` }} /></div>
          <span className="w-10 text-right text-xs tabular-nums">{r.pct} %</span>
        </div>
      ),
    },
    n("reserves", r_.reserves),
    n("refusals", r_.refusals),
    n("anomalies", r_.anomalies),
    n("increases", r_.priceIncreases),
    { key: "avg", label: r_.avgIncrease, align: "right", text: (r) => fmtPct(r.avg), sort: (r) => r.avg },
  ];
  return <DataTable rows={rows} cols={cols} rowKey={(r) => r.supplier} empty={r_.noData} defaultSort={{ key: "receptions", dir: "desc" }} maxHeight="max-h-[60vh]" dense />;
}
