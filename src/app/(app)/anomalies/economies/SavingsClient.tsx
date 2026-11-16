"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSupplierGroupAction, relinkSupplierGroupAction } from "@/lib/actions/anomalies";
import { stageOf, stageStyles } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney, sentence } from "@/lib/format";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { DataTable, type Col } from "@/components/table/DataTable";

/** Une anomalie qui compte dans un montant (pour savoir d'où il vient) — repérée par son N° de réclamation */
export interface Contribution { id: number; number: number; final: boolean; closed: boolean; date: string; supplier: string; product: string; stage: string; resolution: string | null; amount: number; kind: "credit" | "claimed" }

export interface SupplierLine {
  key: string; supplierId: number | null; name: string; count: number; open: number; obtained: number; pending: number; avgDays: number | null;
  items: Contribution[];
}

/** Liste des anomalies derrière un montant : N° (lien vers la fiche), fournisseur, produit, étape, montant */
export function DetailModal({ title, items, onClose }: { title: string; items: Contribution[]; onClose: () => void }) {
  const { t, locale } = useI18n();
  const e = t.savings;
  const total = items.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl" onClick={(x) => x.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-stone-100 p-4">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-stone-600">{items.length} {e.lines} · {e.total} <strong>{fmtMoney(total, locale)}</strong></p>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t.common.close}><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500"><tr><th className="p-1.5">{t.claims.title} N°</th><th className="p-1.5">{t.common.date}</th><th className="p-1.5">{t.common.supplier}</th><th className="p-1.5">{t.common.product}</th><th className="p-1.5">{t.common.status}</th><th className="p-1.5 text-right">{e.amount}</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={`${c.kind}-${c.id}`} className="border-t border-stone-100">
                  <td className="p-1.5"><Link href={`/anomalies/${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.number}</Link></td>
                  <td className="whitespace-nowrap p-1.5">{c.date}</td>
                  <td className="p-1.5">{sentence(c.supplier)}</td>
                  <td className="p-1.5">{c.product}</td>
                  <td className="p-1.5"><span className={`badge ${stageStyles[stageOf(c.stage)]}`}>{t.stages[stageOf(c.stage)]}</span>{c.resolution && <span className="ml-1 text-xs text-stone-500">{t.resolutions[c.resolution as "avoir"]}</span>}</td>
                  <td className="p-1.5 text-right tabular-nums">{fmtMoney(c.amount, locale)} <span className="text-[10px] text-stone-400">{c.kind === "credit" ? e.creditShort : e.claimedShort}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Vignette cliquable : le montant, et au clic la liste des anomalies qui le composent */
export function AmountTile({ label, value, sub, cls, title, items }: { label: string; value: string; sub?: string; cls: string; title: string; items: Contribution[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`rounded-xl p-4 text-left transition hover:ring-2 hover:ring-brand-300 ${cls}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs opacity-80">{sub}</p>}
        <p className="mt-1 text-[11px] font-semibold underline opacity-70">{t.savings.seeDetail}</p>
      </button>
      {open && <DetailModal title={title} items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Par fournisseur : en-têtes à filtre, lien vers le compte fournisseur, détail des montants, rattachement des lignes sans fournisseur */
export function SupplierSavings({ rows, suppliers, canManage }: { rows: SupplierLine[]; suppliers: { id: number; name: string }[]; canManage: boolean }) {
  const { t, locale } = useI18n();
  const e = t.savings;
  const router = useRouter();
  const [detail, setDetail] = useState<SupplierLine | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const money = (n: number) => (n ? fmtMoney(n, locale) : "—");
  const cols: Col<SupplierLine>[] = [
    { key: "id", width: "4rem", label: "N°", text: (r) => (r.supplierId ? String(r.supplierId) : ""), sort: (r) => r.supplierId ?? 0 },
    {
      key: "supplier", label: t.common.supplier, text: (r) => r.name,
      render: (r) =>
        r.supplierId ? <Link href={`/mercurial/fournisseurs/${r.supplierId}?tab=anomalies`} className="font-medium text-brand-700 hover:underline">{sentence(r.name)}</Link>
        : (
          <div className="space-y-1">
            <span className="font-medium text-red-700" title={e.unlinked}>⚠ {r.name}</span>
            {canManage && linking !== r.key && (
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-brand-700 underline" onClick={() => { setLinking(r.key); setTarget(""); }}>{e.link}</button>
                <button
                  type="button"
                  className="text-red-600 underline"
                  onClick={async () => { if (await appConfirm(`${e.deleteGroup} (${r.count})\n${r.name}`)) start(async () => { await deleteSupplierGroupAction(r.name); router.refresh(); }); }}
                >
                  {t.common.delete}
                </button>
              </div>
            )}
            {linking === r.key && (
              <div className="flex flex-wrap items-center gap-1">
                <select className="input py-1 text-xs" value={target} onChange={(x) => setTarget(x.target.value)}>
                  <option value="">{e.chooseSupplier}</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{sentence(s.name)}</option>)}
                </select>
                <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={!target || pending} onClick={() => start(async () => { await relinkSupplierGroupAction(r.name, Number(target)); setLinking(null); router.refresh(); })}>{t.common.save}</button>
                <button type="button" className="px-1 text-xs text-stone-500" onClick={() => setLinking(null)}>✕</button>
              </div>
            )}
          </div>
        ),
    },
    { key: "count", width: "6rem", label: e.anomalies, align: "right", text: (r) => String(r.count), sort: (r) => r.count, filterable: false },
    { key: "open", width: "6rem", label: e.stillOpen, align: "right", text: (r) => String(r.open), sort: (r) => r.open, filterable: false },
    { key: "obtained", width: "8rem", label: e.obtained, align: "right", text: (r) => money(r.obtained), sort: (r) => r.obtained, filterable: false, className: "font-semibold text-emerald-800" },
    { key: "pending", width: "8rem", label: e.pending, align: "right", text: (r) => money(r.pending), sort: (r) => r.pending, filterable: false, className: "text-amber-800" },
    { key: "avg", width: "7rem", label: e.avgDays, align: "right", keepCase: true, text: (r) => (r.avgDays != null ? `${r.avgDays} ${t.kanban.days}` : "—"), sort: (r) => r.avgDays, filterable: false },
    { key: "detail", width: "5.5rem", label: "", text: () => "", sortable: false, filterable: false, render: (r) => <button type="button" className="btn-ghost px-2 py-1 text-xs text-brand-700" onClick={() => setDetail(r)}>{e.detail}</button> },
  ];
  return (
    <>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.key} defaultSort={{ key: "obtained", dir: "desc" }} dense fixed rowClassName={(r) => (r.supplierId ? "" : "bg-red-50/50")} />
      {detail && <DetailModal title={`${sentence(detail.name)} · ${e.detailTitle}`} items={detail.items} onClose={() => setDetail(null)} />}
    </>
  );
}

/** Un chiffre justifié : au clic, la liste des anomalies (N° de réclamation) qui le composent */
export function Justified({ title, items, children, className = "" }: { title: string; items: Contribution[]; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return <span className={className}>{children}</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`underline decoration-dotted underline-offset-2 hover:text-brand-700 ${className}`}>{children}</button>
      {open && <DetailModal title={title} items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

export interface RecapLine { key: string; supplierId: number | null; name: string; month: string; monthSort: string; count: number; closed: number; obtained: number; pending: number; items: Contribution[] }

/** Récapitulatif fournisseur × mois : une ligne par fournisseur et par mois, filtres d'en-tête, bouton Détail */
export function RecapTable({ rows }: { rows: RecapLine[] }) {
  const { t, locale } = useI18n();
  const e = t.savings;
  const [detail, setDetail] = useState<RecapLine | null>(null);
  const money = (n: number) => (n ? fmtMoney(n, locale) : "—");
  const cols: Col<RecapLine>[] = [
    { key: "id", width: "4rem", label: "N°", text: (r) => (r.supplierId ? String(r.supplierId) : ""), sort: (r) => r.supplierId ?? 0 },
    { key: "supplier", label: t.common.supplier, text: (r) => r.name, render: (r) => (r.supplierId ? <Link href={`/mercurial/fournisseurs/${r.supplierId}`} className="font-medium text-brand-700 hover:underline">{sentence(r.name)}</Link> : <span className="text-red-700">⚠ {r.name}</span>) },
    { key: "month", width: "9rem", label: e.month, text: (r) => r.month, sort: (r) => r.monthSort, keepCase: true },
    { key: "count", width: "6rem", label: e.anomalies, align: "right", text: (r) => String(r.count), sort: (r) => r.count },
    { key: "closed", width: "6rem", label: e.closedCol, align: "right", text: (r) => String(r.closed), sort: (r) => r.closed },
    { key: "open", width: "6rem", label: e.stillOpen, align: "right", text: (r) => String(r.count - r.closed), sort: (r) => r.count - r.closed },
    { key: "obtained", width: "8rem", label: e.obtained, align: "right", text: (r) => money(r.obtained), sort: (r) => r.obtained, className: "font-semibold text-emerald-800" },
    { key: "pending", width: "8rem", label: e.pending, align: "right", text: (r) => money(r.pending), sort: (r) => r.pending, className: "text-amber-800" },
    { key: "detail", width: "5.5rem", label: "", text: () => "", sortable: false, filterable: false, render: (r) => <button type="button" className="btn-ghost px-2 py-1 text-xs text-brand-700" onClick={() => setDetail(r)}>{e.detail}</button> },
  ];
  return (
    <>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.key} defaultSort={{ key: "month", dir: "desc" }} dense fixed />
      {detail && <DetailModal title={`${sentence(detail.name)} · ${detail.month}`} items={detail.items} onClose={() => setDetail(null)} />}
    </>
  );
}
