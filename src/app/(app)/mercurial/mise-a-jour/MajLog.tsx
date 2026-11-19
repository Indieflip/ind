"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { linkMajProductAction, updateMajClaimAction } from "@/lib/actions/maj";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate } from "@/lib/format";
import { DataTable, type Col } from "@/components/table/DataTable";

interface Row { id: number; date: string | null; nature: string | null; item: string | null; original: string | null; detail: string | null; supplier: string | null; supplierId: number | null; reference: string | null; claim: string | null; priceHref: string | null; productId?: number | null }
interface Product { id: number; name: string; supplierId: number; supplier: string }

/** Historique « Suivi MAJ » repris du fichier Excel, mêmes colonnes, filtres d'en-tête */
export function MajLog({ rows, editable, compact = false, products = [] }: { rows: Row[]; editable: boolean; compact?: boolean; products?: Product[] }) {
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const unmatched = rows.filter((r) => !r.productId).length;
  const { t, locale } = useI18n();
  const m = t.maj;
  const all: Col<Row>[] = [
    { key: "date", label: m.date, text: (r) => (r.date ? fmtDate(r.date, locale) : ""), sort: (r) => r.date, className: "whitespace-nowrap" },
    { key: "nature", label: m.nature, text: (r) => r.nature ?? "" },
    { key: "item", label: m.item, text: (r) => r.item ?? "", render: (r) => <>{r.item || "—"}{r.original && <span className="block text-[11px] text-stone-400" title={m.original}>{r.original}</span>}</> },
    { key: "detail", label: m.detail, text: (r) => r.detail ?? "", className: "whitespace-pre-wrap", render: (r) => <>{r.detail}{r.priceHref && <a href={r.priceHref} className="mt-0.5 block text-[11px] font-semibold text-brand-700 underline">{m.seePrice}</a>}</> },
    { key: "supplier", label: m.supplier, text: (r) => r.supplier ?? "", href: (r) => (r.supplierId ? `/mercurial/fournisseurs/${r.supplierId}` : null) },
    { key: "reference", label: m.reference, text: (r) => r.reference ?? "", className: "whitespace-pre-wrap text-stone-600" },
    {
      key: "match", label: m.match, text: (r) => (r.productId ? m.matched : m.unmatched), className: "min-w-56",
      render: (r) =>
        r.productId ? (
          <Link href={`/mercurial/produits/${r.productId}`} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">✓ {m.seeProduct}</Link>
        ) : editable ? (
          <ProductPicker id={r.id} supplierId={r.supplierId} item={r.item ?? ""} products={products} />
        ) : (
          <span className="badge bg-amber-100 text-amber-800">⚠ {m.unmatched}</span>
        ),
    },
    { key: "claim", label: m.claim, text: (r) => r.claim ?? "", className: "min-w-56", render: (r) => (editable ? <Claim id={r.id} initial={r.claim ?? ""} /> : r.claim || "—") },
  ];
  const cols = compact ? all.filter((c) => c.key !== "item" && c.key !== "supplier" && c.key !== "match") : all;
  if (compact) return <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} empty={m.empty} />;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{m.title}</h1>
        <a className="btn-secondary py-2" href="/api/export/maj">{t.common.exportCsv}</a>
      </div>
      <label className={`mb-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${unmatched ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} disabled={!unmatched} />
        ⚠ {m.unmatchedOnly} <strong>({unmatched})</strong>
      </label>
      <DataTable
        rows={unmatchedOnly ? rows.filter((r) => !r.productId) : rows}
        cols={cols}
        rowKey={(r) => r.id}
        copy={{ source: m.title, fields: (r) => ({ date: r.date ?? "", nature: r.nature ?? "", product: r.item ?? "", supplier: r.supplier ?? "", supplierId: r.supplierId ? String(r.supplierId) : "", reference: r.reference ?? "", description: `${r.item ?? ""} : ${r.detail ?? ""}`, detail: r.detail ?? "" }) }}
      />
    </section>
  );
}

function Claim({ id, initial }: { id: number; initial: string }) {
  const [v, setV] = useState(initial);
  const [, start] = useTransition();
  return <input className="input py-1.5 text-sm" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== initial && start(() => updateMajClaimAction(id, v))} />;
}

/** Choisir le produit du Mercurial correspondant à une ligne de l'historique (produits du même fournisseur en premier) */
function ProductPicker({ id, supplierId, item, products }: { id: number; supplierId: number | null; item: string; products: Product[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  const list = supplierId ? [...products.filter((p) => p.supplierId === supplierId), ...products.filter((p) => p.supplierId !== supplierId)] : products;
  const label = (p: Product) => `${p.name} — ${p.supplier} (n° ${p.id})`;
  const pick = (text: string) => {
    const p = list.find((x) => label(x) === text);
    if (!p) return;
    start(async () => { await linkMajProductAction(id, p.id); router.refresh(); });
  };
  return (
    <div>
      <span className="badge mb-1 bg-amber-100 text-amber-800">⚠ {t.maj.unmatched}</span>
      <input
        className="input py-1.5 text-sm"
        list={`maj-products-${id}`}
        placeholder={item ? `${t.maj.pickProduct} (${item})` : t.maj.pickProduct}
        value={v}
        disabled={pending}
        onChange={(e) => { setV(e.target.value); pick(e.target.value); }}
      />
      <datalist id={`maj-products-${id}`}>{list.slice(0, 400).map((p) => <option key={p.id} value={label(p)} />)}</datalist>
    </div>
  );
}
