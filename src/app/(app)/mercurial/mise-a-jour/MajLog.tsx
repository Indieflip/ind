"use client";
import { dayOf } from "@/lib/numbering";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteMajAction, linkMajProductAction, updateMajClaimAction } from "@/lib/actions/maj";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate } from "@/lib/format";
import { isSupplierCreation, isSupplierInfo } from "@/lib/majKinds";
import { DataTable, type Col } from "@/components/table/DataTable";

interface Row { id: number; date: string | null; nature: string | null; item: string | null; original: string | null; detail: string | null; supplier: string | null; supplierId: number | null; reference: string | null; claim: string | null; priceHref: string | null; productId?: number | null }
interface Product { id: number; name: string; supplierId: number; supplier: string }

/** Historique « Suivi MAJ » repris du fichier Excel, mêmes colonnes, filtres d'en-tête */
export function MajLog({ rows, editable, compact = false, products = [] }: { rows: Row[]; editable: boolean; compact?: boolean; products?: Product[] }) {
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  // Création d'un compte fournisseur : pas un produit, elle date le compte du fournisseur
  const supplierEvent = (r: Row) => isSupplierCreation(r.nature, r.item, r.detail);
  const supplierInfo = (r: Row) => isSupplierInfo(r.nature, r.item, r.detail);
  const isUnmatched = (r: Row) => !r.productId && !supplierEvent(r) && !supplierInfo(r);
  const unmatched = rows.filter(isUnmatched).length;
  const { t, locale } = useI18n();
  const m = t.maj;
  const all: Col<Row>[] = [
    { key: "date", label: m.date, text: (r) => (r.date ? fmtDate(r.date, locale) : ""), sort: (r) => r.date, date: (r) => dayOf(r.date), className: "whitespace-nowrap" },
    { key: "nature", label: m.nature, text: (r) => r.nature ?? "" },
    { key: "item", label: m.item, text: (r) => r.item ?? "", render: (r) => <>{r.item || "—"}{r.original && <span className="block text-[11px] text-stone-400" title={m.original}>{r.original}</span>}</> },
    { key: "detail", label: m.detail, text: (r) => r.detail ?? "", className: "whitespace-pre-wrap", render: (r) => <>{r.detail}{r.priceHref && <a href={r.priceHref} className="mt-0.5 block text-[11px] font-semibold text-brand-700 underline">{m.seePrice}</a>}</> },
    { key: "supplier", label: m.supplier, text: (r) => r.supplier ?? "", href: (r) => (r.supplierId ? `/mercurial/fournisseurs/${r.supplierId}` : null) },
    { key: "reference", label: m.reference, text: (r) => r.reference ?? "", className: "whitespace-pre-wrap text-stone-600" },
    {
      key: "match", label: m.match, text: (r) => (r.productId ? m.matched : supplierEvent(r) ? m.supplierCreated : supplierInfo(r) ? m.supplierInfo : m.unmatched), className: "min-w-56",
      render: (r) =>
        supplierInfo(r) && !r.productId ? (
          r.supplierId ? <Link href={`/mercurial/fournisseurs/${r.supplierId}`} className="text-sm font-medium text-sky-700 hover:underline">ℹ️ {m.supplierInfo}</Link> : <span className="text-sm text-sky-700">ℹ️ {m.supplierInfo}</span>
        ) : supplierEvent(r) && !r.productId ? (
          r.supplierId ? <Link href={`/mercurial/fournisseurs/${r.supplierId}`} className="text-sm font-medium text-sky-700 hover:underline">🏢 {m.supplierCreated}</Link> : <span className="text-sm text-sky-700">🏢 {m.supplierCreated}</span>
        ) : (
          <ProductLink row={r} products={products} editable={editable} />
        ),
    },
    { key: "claim", label: m.claim, text: (r) => r.claim ?? "", className: "min-w-56", render: (r) => (editable ? <Claim id={r.id} initial={r.claim ?? ""} /> : r.claim || "—") },
    ...(editable && !compact ? [{ key: "del", label: "", sortable: false, text: () => "", render: (r: Row) => <DeleteMaj id={r.id} /> } as Col<Row>] : []),
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
      {editable && <datalist id="maj-products">{products.map((p) => <option key={p.id} value={productLabel(p)} />)}</datalist>}
      <DataTable
        rows={unmatchedOnly ? rows.filter(isUnmatched) : rows}
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
function ProductPicker({ id, supplierId, item, products, onDone, hideBadge = false }: { id: number; supplierId: number | null; item: string; products: Product[]; onDone?: () => void; hideBadge?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState("");
  const [pending, start] = useTransition();
  const pick = (text: string) => {
    const p = products.find((x) => productLabel(x) === text);
    if (!p) return;
    start(async () => { await linkMajProductAction(id, p.id); setV(""); onDone?.(); router.refresh(); });
  };
  return (
    <div>
      {!hideBadge && <span className="badge mb-1 bg-amber-100 text-amber-800">⚠ {t.maj.unmatched}</span>}
      <input
        className="input py-1.5 text-sm"
        list="maj-products"
        placeholder={item ? `${t.maj.pickProduct} (${item})` : t.maj.pickProduct}
        value={v}
        disabled={pending}
        onChange={(e) => { setV(e.target.value); pick(e.target.value); }}
      />
    </div>
  );
}

/** Produit rattaché à la ligne : lien vers sa fiche, et « Modifier » pour le changer ou le détacher */
function ProductLink({ row, products, editable }: { row: Row; products: Product[]; editable: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (!row.productId) return editable ? <ProductPicker id={row.id} supplierId={row.supplierId} item={row.item ?? ""} products={products} /> : <span className="badge bg-amber-100 text-amber-800">⚠ {t.maj.unmatched}</span>;
  return (
    <div className="space-y-1">
      <span className="flex flex-wrap items-center gap-2">
        <Link href={`/mercurial/produits/${row.productId}`} className="text-sm font-medium text-emerald-700 hover:underline">✓ {t.maj.seeProduct}</Link>
        {editable && <button type="button" className="text-xs text-stone-500 underline hover:text-stone-800" onClick={() => setEditing((e) => !e)}>{editing ? t.common.cancel : t.common.edit}</button>}
      </span>
      {editing && (
        <>
          <ProductPicker id={row.id} supplierId={row.supplierId} item={row.item ?? ""} products={products} onDone={() => setEditing(false)} hideBadge />
          <button type="button" className="text-xs text-red-600 underline" disabled={pending} onClick={() => start(async () => { await linkMajProductAction(row.id, null); setEditing(false); router.refresh(); })}>{t.maj.detach}</button>
        </>
      )}
    </div>
  );
}

const productLabel = (p: Product) => `${p.name} — ${p.supplier} (n° ${p.id})`;

/** Supprimer une ligne de l'historique, après confirmation */
function DeleteMaj({ id }: { id: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" disabled={pending} aria-label={t.common.delete} title={t.common.delete}
      onClick={async () => { if (await appConfirm(t.maj.deleteConfirm)) start(async () => { await deleteMajAction(id); router.refresh(); }); }}>
      <Icon name="trash" className="h-4 w-4" />
    </button>
  );
}
