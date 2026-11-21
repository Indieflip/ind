"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteProductAction, setProductActiveAction, updateMercurialRowAction } from "@/lib/actions/mercurial";
import { useI18n } from "@/lib/i18n/client";
import { appAlert, appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { UnitSelect } from "@/components/UnitSelect";
import { NatureSelect } from "@/components/NatureSelect";

/** Compte produit : modifier (nom, unité, nature, prix, prix bloqué, actif) ou supprimer le produit */
export function ProductEditor({ product, units, natures, fv }: {
  product: { id: number; name: string; unit: string; nature: string | null; priceMin: number | null; price: number | null; priceLocked: boolean; active: boolean; lossPct: number | null };
  units: string[]; natures: string[]; fv: boolean;
}) {
  const { t } = useI18n();
  const m = t.mercurial;
  const P = t.productPage;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const str = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");
  const [v, setV] = useState({ name: product.name, unit: product.unit, nature: product.nature ?? "", priceMin: str(product.priceMin), price: str(product.price), priceLocked: product.priceLocked, lossPct: str(product.lossPct) });
  const save = () => start(async () => {
    const res = await updateMercurialRowAction(product.id, {
      name: v.name, unit: v.unit, nature: v.nature, priceLocked: v.priceLocked, acceptableLossPct: v.lossPct,
      ...(fv ? {} : { priceMin: v.priceMin, price: v.price }),
    }, { trace: false });
    if (res && "error" in res && res.error === "exists") return void (await appAlert(m.duplicateEdit));
    setOpen(false);
    router.refresh();
  });
  const remove = async () => {
    if (!(await appConfirm(P.deleteConfirm))) return;
    start(async () => { await deleteProductAction(product.id); router.push("/mercurial"); });
  };
  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary py-1.5" onClick={() => setOpen(true)}><Icon name="edit" className="h-4 w-4" /> {t.common.edit}</button>
        <button type="button" className="btn-ghost py-1.5 text-red-600 hover:bg-red-50" disabled={pending} onClick={remove}><Icon name="trash" className="h-4 w-4" /> {t.common.delete}</button>
      </div>
    );
  }
  return (
    <section className="card w-full space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="sm:col-span-2"><span className="label">{m.products} *</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label><span className="label">{t.common.unit}</span><UnitSelect className="input" value={v.unit} units={units} onChange={(unit) => setV({ ...v, unit })} /></label>
        <div><span className="label">{m.nature}</span><NatureSelect value={v.nature} options={natures} onChange={(nature) => setV({ ...v, nature })} /></div>
        {fv ? (
          <p className="text-sm text-stone-600 sm:col-span-2">{P.fvPrices} <Link href="/mercurial/fruits-legumes" className="text-brand-700 underline">{t.nav.fruitsVeg}</Link></p>
        ) : (
          <>
            <label><span className="label">{m.priceMin}</span><MoneyInput value={v.priceMin} onChange={(e) => setV({ ...v, priceMin: e.target.value })} /></label>
            <label><span className="label">{m.priceMax}</span><MoneyInput value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></label>
          </>
        )}
        <label><span className="label">{P.lossPct}</span><div className="relative"><input className="input pr-8 text-right" inputMode="decimal" value={v.lossPct} onChange={(e) => setV({ ...v, lossPct: e.target.value })} placeholder="0" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">%</span></div><span className="mt-0.5 block text-xs text-stone-500">{P.lossPctHint}</span></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.priceLocked} onChange={(e) => setV({ ...v, priceLocked: e.target.checked })} /> 🔒 {m.locked}</label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <button type="button" className="btn-primary" disabled={pending || !v.name.trim()} onClick={save}><Icon name="check" className="h-4 w-4" /> {t.common.save}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t.common.cancel}</button>
        <span className="flex-1" />
        <button type="button" className="btn-ghost text-sm" disabled={pending} onClick={() => start(async () => { await setProductActiveAction(product.id, !product.active); router.refresh(); })}>{product.active ? t.suppliers.deactivate : t.suppliers.reactivate}</button>
        <button type="button" className="btn-ghost text-sm text-red-600 hover:bg-red-50" disabled={pending} onClick={remove}><Icon name="trash" className="h-4 w-4" /> {t.common.delete}</button>
      </div>
    </section>
  );
}
