"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, DocRef, Draft, DraftLine } from "@/lib/reception-types";
import { fetchCatalog, loadCatalogCache, sendReception } from "@/lib/client/offline";
import { num } from "@/lib/format";
import { WEIGH_TYPE } from "@/lib/anomaly";
import { DateField } from "@/components/DateField";
import { MoneyInput } from "@/components/MoneyInput";
import { UnitSelect } from "@/components/UnitSelect";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "../Icon";
import { buildReservesText, detectedType, docsOf, lineFromProduct, needsDlc, toPayload } from "./helpers";

const DEFAULT_UNITS = ["Pièce", "Kg", "Litre", "Sachet"];

/**
 * Modification directe sur la fiche de réception : la page de la fiche reste la même (en-tête, documents, livraison, produits, réserves),
 * ses champs deviennent modifiables. Enregistrer applique les mêmes règles que la modification complète (fiches d'anomalie reliées).
 */
export function InlineEditor({ id, initialDraft, number }: { id: number; initialDraft: Draft; number: string }) {
  const { t } = useI18n();
  const w = t.wizard;
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog>();
  const [d, setD] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const reprise = d.kind === "reprise";

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await loadCatalogCache();
      if (c && alive) setCatalog(c);
      const f = await fetchCatalog();
      if (f && alive) setCatalog(f);
    })();
    return () => { alive = false; };
  }, []);

  // Réserves recalculées tant qu'elles n'ont pas été modifiées à la main
  const autoReserves = useMemo(() => buildReservesText(d, t, catalog), [d, t, catalog]);
  useEffect(() => {
    if (!d.reservesEdited && d.reservesText !== autoReserves) setD((x) => ({ ...x, reservesText: autoReserves }));
  }, [autoReserves, d.reservesEdited, d.reservesText]);

  const setLine = (key: string, patch: Partial<DraftLine>) => setD((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const docs = docsOf(d);
  const setDocs = (next: DocRef[]) => setD((x) => ({ ...x, documents: next, blNumber: next.find((y) => y.number.trim())?.number ?? "" }));
  const units = catalog?.units ?? DEFAULT_UNITS;
  const reasons = [...(catalog?.reasons ?? [])].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const supplierProducts = (catalog?.products ?? []).filter((p) => p.supplierId === d.supplierId);
  // Produit tapé = un produit du Mercurial du fournisseur : la ligne prend ce produit (compte, unité, catégorie, tranche de prix)
  const replaceProduct = (key: string, name: string) => {
    const p = supplierProducts.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
    setLine(key, p
      ? { productName: p.name, productId: p.id, unit: p.unit || "Pièce", categoryId: p.categoryId ?? null, mercurialPrice: p.price ?? null, mercurialMin: p.priceMin ?? null, priceLocked: !!p.locked }
      : { productName: name, productId: null });
  };

  async function save() {
    setError("");
    const named = d.lines.filter((l) => l.productName.trim());
    const go = (key: string, msg: string) => { setError(msg); setTimeout(() => document.getElementById(`il-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
    if (reprise) {
      const noQty = named.find((l) => !((num(l.qtyReceived) ?? num(l.qtyOrdered) ?? 0) > 0));
      if (noQty) return go(noQty.key, `${named.filter((l) => !((num(l.qtyReceived) ?? num(l.qtyOrdered) ?? 0) > 0)).length} ${w.qtyRequired}`);
      const noReason = named.find((l) => !l.reason);
      if (noReason) return go(noReason.key, `${named.filter((l) => !l.reason).length} ${w.reasonRequired}`);
    } else if (!d.imported) {
      const noPrice = named.filter((l) => !l.unitPrice.trim() && !l.priceNotShown);
      if (noPrice.length) return go(noPrice[0].key, `${noPrice.length} ${w.missingPrice}`);
      const noDlc = named.filter((l) => needsDlc(l, catalog));
      if (noDlc.length) return go(noDlc[0].key, `${noDlc.length} ${w.missingDlc}`);
    }
    setSaving(true);
    try {
      await sendReception(toPayload({ ...d, lines: d.lines.map((l) => (l.decision ? l : { ...l, decision: "conform" as const })) }), id);
      router.replace(`/receptions/${id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message === "duplicate_doc" ? w.docDuplicateSave : `${t.editReception.saveFailed} (${(e as Error).message})`);
      setSaving(false);
    }
  }

  const label = (text: string) => <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{text}</span>;
  const box = "bg-white p-4";
  return (
    <div className="space-y-4 pb-28">
      <section className="card overflow-hidden ring-2 ring-amber-300">
        <div className={`flex flex-wrap items-start justify-between gap-4 px-5 py-4 text-white ${reprise ? "bg-gradient-to-r from-amber-600 to-amber-500" : "bg-gradient-to-r from-brand-700 to-brand-600"}`}>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/75">✎ {t.editReception.title} · {number}</p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight">{d.supplierName}</h1>
            <input type="datetime-local" className="mt-2 rounded-lg border-0 bg-white/95 px-2 py-1 text-sm text-stone-900" value={d.deliveredAt} onChange={(e) => setD((x) => ({ ...x, deliveredAt: e.target.value }))} aria-label={reprise ? w.dateTimeReturn : w.dateTime} />
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{t.receptions.inlineEditing}</span>
        </div>

        <div className={`grid gap-px bg-stone-200 ${reprise ? "" : "sm:grid-cols-2"}`}>
          <div className={box}>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="file" className="h-4 w-4" /> {t.receptions.documents}</h2>
            <div className="space-y-2">
              {docs.map((doc, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5 sm:grid-cols-[auto_1fr_auto_auto]">
                  <select className="input py-1.5 text-sm" value={doc.type} onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, type: e.target.value as DocRef["type"] } : x)))}>
                    {(["bl", "facture", "reprise", "autre"] as const).map((k) => <option key={k} value={k}>{w.docTypes[k]}</option>)}
                  </select>
                  <input className="input order-last col-span-3 py-1.5 text-sm sm:order-none sm:col-span-1" placeholder={w.blNumber} value={doc.number} onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
                  <DateField className="py-1.5 text-sm" value={doc.date ?? ""} onChange={(v) => setDocs(docs.map((x, j) => (j === i ? { ...x, date: v } : x)))} />
                  <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" aria-label={t.common.delete} disabled={docs.length < 2} onClick={() => setDocs(docs.filter((_, j) => j !== i))}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" className="btn-ghost px-2 py-1 text-sm text-brand-700" onClick={() => setDocs([...docs, { type: "facture", number: "" }])}><Icon name="plus" className="h-4 w-4" /> {w.addDocument}</button>
              {!reprise && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!d.missingBl} onChange={(e) => setD((x) => ({ ...x, missingBl: e.target.checked }))} /> {w.missingBlBox}</label>
              )}
            </div>
          </div>
          {!reprise && (
            <div className={box}>
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="truck" className="h-4 w-4" /> {t.receptions.delivery}</h2>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2">{label(t.receptions.driver)}<input className="input py-1.5" value={d.driverName} onChange={(e) => setD((x) => ({ ...x, driverName: e.target.value }))} /></label>
                <label>{label(t.receptions.truckTemp)}<input className="input py-1.5" inputMode="decimal" value={d.truckTemp} onChange={(e) => setD((x) => ({ ...x, truckTemp: e.target.value }))} /></label>
                <div>{label(t.receptions.vehicleClean)}
                  <div className="grid grid-cols-2 gap-1">
                    {[true, false].map((v) => (
                      <button key={String(v)} type="button" onClick={() => setD((x) => ({ ...x, vehicleClean: x.vehicleClean === v ? null : v }))}
                        className={`rounded-lg border px-2 py-1.5 text-sm ${d.vehicleClean === v ? (v ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-800") : "border-stone-300 bg-white"}`}>{v ? t.common.yes : t.common.no}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Produits : mêmes cartes que la fiche, avec les champs modifiables */}
      <section className="space-y-3">
        {d.lines.map((l) => {
          const auto = !reprise && l.decision === "conform" && !l.refuseOn && !l.returnOn ? detectedType(l, catalog, t.anomalies.types, WEIGH_TYPE) : null;
          const motif = l.refuseOn || l.returnOn || l.decision === "refuse" || reprise;
          const typeValue = l.reason || (auto ?? "");
          return (
            <article key={l.key} id={`il-${l.key}`} className={`card scroll-mt-24 border-l-4 p-4 ${l.decision === "refuse" ? "border-l-red-500" : reprise ? "border-l-amber-400" : "border-l-emerald-500"}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                {/* Produit : remplacé par un autre du Mercurial du fournisseur (liste) ou renommé (texte libre) */}
                <div className="min-w-0 flex-1">
                  <input className="input py-1.5 font-semibold" list="il-products" value={l.productName} onChange={(e) => replaceProduct(l.key, e.target.value)} />
                  <p className="mt-0.5 text-[11px] text-stone-500">{l.productId ? `✓ ${w.fromMercurial}` : w.notInMercurial} · {w.replaceHint}</p>
                </div>
                <button type="button" className="btn-ghost p-1.5 text-stone-400 hover:text-red-600" aria-label={t.common.delete} onClick={async () => { if (await appConfirm(w.removeLineConfirm)) setD((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) })); }}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
              {l.originRef && <p className="mb-2 text-xs font-medium text-amber-800">↩ {l.originRef}</p>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label>{label(reprise ? t.returnSlip.qtyOnSlip : w.ordered)}<input className="input py-1.5" inputMode="decimal" value={l.qtyOrdered} onChange={(e) => setLine(l.key, { qtyOrdered: e.target.value })} /></label>
                <label>{label(reprise ? t.returnSlip.qtyTaken : w.received)}<input className="input py-1.5" inputMode="decimal" value={l.qtyReceived} onChange={(e) => setLine(l.key, { qtyReceived: e.target.value })} /></label>
                <label>{label(t.common.unit)}<UnitSelect className="input py-1.5" value={l.unit} units={units} onChange={(unit) => setLine(l.key, { unit })} /></label>
                <div>{label(w.unitPrice)}<MoneyInput className="input py-1.5" value={l.unitPrice} disabled={!!l.priceNotShown} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} />
                  {/* Prix non indiqué sur le bon : prix du Mercurial repris */}
                  <label className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-600">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={!!l.priceNotShown} onChange={(e) => {
                      const cp = l.productId ? catalog?.products.find((x) => x.id === l.productId) : undefined;
                      const ref = l.mercurialPrice ?? l.mercurialMin ?? cp?.price ?? cp?.priceMin ?? null;
                      setLine(l.key, e.target.checked ? { priceNotShown: true, unitPrice: ref != null ? String(ref).replace(".", ",") : "" } : { priceNotShown: false, unitPrice: "" });
                    }} /> {w.priceNotShown}
                  </label>
                </div>
                {!reprise && <label>{label(w.temperature)}<input className="input py-1.5" inputMode="decimal" value={l.temperature} onChange={(e) => setLine(l.key, { temperature: e.target.value })} /></label>}
                {!reprise && <label>{label(w.dlc)}<DateField className="py-1.5" value={l.dlc} onChange={(v) => setLine(l.key, { dlc: v })} /></label>}
                <label>{label(w.lot)}<input className="input py-1.5" value={l.lot} onChange={(e) => setLine(l.key, { lot: e.target.value })} /></label>
                {!reprise && (
                  <div>{label(t.common.status)}
                    <div className="grid grid-cols-2 gap-1">
                      {(["conform", "refuse"] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setLine(l.key, { decision: v, decisionManual: true })}
                          className={`rounded-lg border px-1 py-1.5 text-xs font-semibold ${l.decision === v ? (v === "conform" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-800") : "border-stone-300 bg-white text-stone-500"}`}>{v === "conform" ? w.accepted : t.decision.refuse}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Refus / Retour : boutons ; activés, ils font apparaître Quantité + Unité (pré-remplies) et le motif juste dessous */}
              {!reprise && (
                <div className="mt-3">
                  <div className="grid grid-cols-2">
                    <button type="button" onClick={() => setLine(l.key, l.refuseOn ? { refuseOn: false } : { refuseOn: true, refuseQty: l.refuseQty || l.qtyOrdered || l.qtyReceived, refuseUnit: l.refuseUnit || l.unit })}
                      className={`rounded-tl-lg border border-b-0 px-2 py-1.5 text-sm font-semibold ${l.refuseOn ? "border-red-600 bg-red-600 text-white" : "border-stone-200 bg-stone-50 text-stone-500"}`}>⛔ {t.decision.refuse}</button>
                    <button type="button" onClick={() => setLine(l.key, l.returnOn ? { returnOn: false } : { returnOn: true, returnQty: l.returnQty || l.qtyOrdered || l.qtyReceived, returnUnit: l.returnUnit || l.unit })}
                      className={`rounded-tr-lg border border-b-0 px-2 py-1.5 text-sm font-semibold ${l.returnOn ? "border-amber-500 bg-amber-500 text-white" : "border-stone-200 bg-stone-50 text-stone-500"}`}>↩ {w.returnBtn}</button>
                  </div>
                  <div className={`space-y-2 rounded-b-lg border p-2.5 ${l.refuseOn ? "border-red-600 bg-red-50" : l.returnOn ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white"}`}>
                    {l.refuseOn || l.returnOn ? (
                      <>
                        {l.refuseOn && (
                          <div className="grid grid-cols-2 gap-2">
                            <label>{label(`${t.decision.refuse} · ${w.returnQty}`)}<input className="input py-1.5" inputMode="decimal" value={l.refuseQty ?? ""} onChange={(e) => setLine(l.key, { refuseQty: e.target.value })} /></label>
                            <label>{label(t.common.unit)}<UnitSelect className="input py-1.5" value={l.refuseUnit || l.unit} units={units} onChange={(u) => setLine(l.key, { refuseUnit: u })} /></label>
                          </div>
                        )}
                        {l.returnOn && (
                          <div className="grid grid-cols-2 gap-2">
                            <label>{label(`${w.returnBtn} · ${w.returnQty}`)}<input className="input py-1.5" inputMode="decimal" value={l.returnQty ?? ""} onChange={(e) => setLine(l.key, { returnQty: e.target.value })} /></label>
                            <label>{label(t.common.unit)}<UnitSelect className="input py-1.5" value={l.returnUnit || l.unit} units={units} onChange={(u) => setLine(l.key, { returnUnit: u })} /></label>
                          </div>
                        )}
                      </>
                    ) : <p className="text-xs text-stone-400">{w.refuseReturnIdle}</p>}
                  </div>
                </div>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(motif || auto || l.typeManual) && (
                  <label>{label(motif ? (reprise ? t.returnSlip.reasonTitle : w.chooseReason) : w.anomalyType)}
                    <select className={`input py-1.5 ${motif ? "" : "border-orange-300 bg-orange-50"}`} value={typeValue} onChange={(e) => setLine(l.key, { reason: e.target.value, typeManual: !motif })}>
                      <option value="">—</option>
                      {[...new Set([...reasons, ...(typeValue ? [typeValue] : [])])].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                )}
                <label className={motif || auto || l.typeManual ? "" : "sm:col-span-2"}>{label(w.note)}<input className="input py-1.5" value={l.note ?? ""} onChange={(e) => setLine(l.key, { note: e.target.value })} /></label>
              </div>
            </article>
          );
        })}
        <div className="card flex flex-wrap items-end gap-2 border-dashed p-3">
          <label className="min-w-0 flex-1">{label(w.addProduct)}
            <input className="input py-1.5" list="il-products" value={newName} placeholder={w.searchProduct} onChange={(e) => setNewName(e.target.value)} />
            <datalist id="il-products">{supplierProducts.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </label>
          <button type="button" className="btn-secondary py-1.5" disabled={!newName.trim()} onClick={() => {
            const p = supplierProducts.find((x) => x.name.toLowerCase() === newName.trim().toLowerCase()) ?? null;
            setD((x) => ({ ...x, lines: [...x.lines, lineFromProduct(p, { productName: p?.name ?? newName.trim(), unit: p?.unit || "Pièce", decision: "conform" })] }));
            setNewName("");
          }}><Icon name="plus" className="h-4 w-4" /> {t.common.add}</button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-2 font-semibold">{t.receptions.reservesText}</h2>
        <textarea className="input min-h-28 text-sm" value={d.reservesText} onChange={(e) => setD((x) => ({ ...x, reservesText: e.target.value, reservesEdited: true }))} />
      </section>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-stone-200 bg-white/95 px-3 py-2 backdrop-blur lg:bottom-0">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          {error && <p className="w-full text-sm font-medium text-red-700">⚠ {error}</p>}
          <button type="button" className="btn-primary flex-1" disabled={saving} onClick={save}><Icon name="check" className="h-4 w-4" /> {saving ? w.saving : t.common.save}</button>
          <Link href={`/receptions/${id}`} className="btn-secondary">{t.common.cancel}</Link>
        </div>
      </div>
    </div>
  );
}
