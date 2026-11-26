"use client";
import { DateField } from "@/components/DateField";
import { MoneyInput } from "@/components/MoneyInput";
import { appConfirm } from "@/components/Confirm";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { REASONS, type Catalog, type Draft, type DraftLine } from "@/lib/reception-types";
import type { Decision } from "@/lib/rules";
import { fmtMoney, fmtPct } from "@/lib/format";
import { decisionStyles } from "../DecisionBadge";
import { Icon } from "../Icon";
import { UnitSelect } from "../UnitSelect";
import { similarity } from "@/lib/fuzzy";
import { PhotoButton, Thumbs } from "./PhotoButton";
import { groupProducts, priceRange, dlcRequired, needsDlc, docNumbers, docsOf, evaluate, isBakerySupplier, lineDoc, lineFromProduct, matches, priceCheck, suggestedReason, withAutoDecision } from "./helpers";
import { az } from "@/lib/search";

const DEFAULT_UNITS = ["Pièce", "Kg", "Litre", "Sachet"];

export function StepCheck({
  draft,
  setDraft,
  updateLine,
  catalog,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  updateLine: (key: string, patch: Partial<DraftLine>) => void;
  catalog?: Catalog;
}) {
  const { t } = useI18n();
  const bakery = isBakerySupplier(draft.supplierName, catalog?.bakerySupplier);
  // Saisie par document : avec plusieurs BL / factures, les produits sont saisis document par document
  const docs = docsOf(draft).filter((x) => x.number.trim());
  const nums = docNumbers(draft);
  const firstUndecided = draft.lines.find((l) => !l.decision);
  const [active, setActive] = useState(firstUndecided ? lineDoc(draft, firstUndecided) : nums[0] ?? "");
  const current = nums.includes(active) ? active : nums[0] ?? "";
  const multi = nums.length > 1;
  const shown = multi ? draft.lines.filter((l) => lineDoc(draft, l) === current) : draft.lines;
  return (
    <>
      {bakery && <BakeryBlock draft={draft} setDraft={setDraft} />}
      {multi && (
        <section className="card p-3">
          <p className="mb-2 text-xs text-stone-600">{t.wizard.byDocument}</p>
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d) => {
              const n = draft.lines.filter((l) => lineDoc(draft, l) === d.number.trim()).length;
              const on = d.number.trim() === current;
              return (
                <button key={d.number} type="button" onClick={() => setActive(d.number.trim())} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-stone-200 bg-white text-stone-600"}`}>
                  {t.wizard.docTypes[d.type]} {d.number} <span className="ml-1 rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">{n}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {shown.length === 0 && <p className="card p-4 text-center text-sm text-stone-500">{t.wizard.noProducts}</p>}
      {shown.map((l) => (
        <LineCard
          key={l.key}
          line={l}
          catalog={catalog}
          supplierId={draft.supplierId}
          truckTemp={draft.truckTemp}
          optional={!!draft.imported}
          onChange={(patch) => updateLine(l.key, patch)}
          onRemove={async () => await appConfirm(t.wizard.removeLineConfirm) && setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))}
        />
      ))}
      <AddProduct draft={draft} setDraft={setDraft} catalog={catalog} doc={multi ? current : undefined} />
    </>
  );
}

function LineCard({
  line,
  catalog,
  supplierId,
  onChange,
  onRemove,
  truckTemp,
  optional = false,
}: {
  line: DraftLine;
  catalog?: Catalog;
  supplierId: number | null;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  truckTemp?: string;
  /** Fiche importée : aucun champ signalé comme obligatoire */
  optional?: boolean;
}) {
  const { t, locale } = useI18n();
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  const ev = evaluate(line, catalog, truckTemp);
  const [swap, setSwap] = useState(false);
  const [swapQ, setSwapQ] = useState("");
  const [swapBrowse, setSwapBrowse] = useState(false);
  const swapResults = useMemo(() => {
    if (!catalog || (!swapBrowse && swapQ.trim().length < 2)) return [];
    const own = groupProducts(catalog.products.filter((p) => p.supplierId === supplierId && (!swapQ.trim() || matches(p.name, swapQ)))).sort((a, b) => az(a.name, b.name));
    return swapBrowse ? own : own.slice(0, 8);
  }, [catalog, swapQ, supplierId, swapBrowse]);
  // Hygiène : pas de DLC ni de lot
  const noDlc = cat?.code === "hygiene";
  const pc = priceCheck(line);
  const lo = line.mercurialMin ?? line.mercurialPrice;
  const hi = line.mercurialPrice ?? line.mercurialMin;
  const rangeLabel = lo == null ? "" : `${t.wizard.mercurial} ${fmtMoney(lo, locale)}${hi != null && hi !== lo ? ` – ${fmtMoney(hi, locale)}` : ""}`;
  const style = line.decision ? decisionStyles[line.decision] : { border: "border-l-stone-300", badge: "", dot: "" };

  const field = (key: keyof DraftLine, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-stone-600">{label}</label>
      <input className="input py-2" value={String(line[key] ?? "")} onChange={(e) => onChange({ [key]: e.target.value } as Partial<DraftLine>)} {...props} />
    </div>
  );

  return (
    <article id={`line-${line.key}`} className={`card scroll-mt-32 border-l-4 ${style.border} p-4 ${!line.decision ? "ring-2 ring-amber-300" : ""}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {line.productId ? (
            <h3 className="font-semibold leading-tight">
              {line.productName}
              <button type="button" className="ml-2 text-xs font-normal text-brand-700 underline" onClick={() => setSwap((v) => !v)}>{t.wizard.changeProduct}</button>
              {/* Nom à corriger à la main : le produit n'est plus rattaché (un produit de ce nom est cherché, sinon créé au Mercurial) */}
              <button type="button" className="ml-2 text-xs font-normal text-stone-500 underline" onClick={() => onChange({ productId: null })}>{t.wizard.renameProduct}</button>
            </h3>
          ) : (
            <div className="flex items-center gap-2">
              <input className="input py-1.5 font-semibold" value={line.productName} placeholder={t.wizard.productName} onChange={(e) => onChange({ productName: e.target.value })} />
              {/* Produit pas encore rattaché (ancienne fiche, produit hors liste) : le choisir dans le Mercurial du fournisseur */}
              <button type="button" className="shrink-0 text-xs text-brand-700 underline" onClick={() => setSwap((v) => !v)}>{t.wizard.pickProduct}</button>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
            {line.productId ? (
              <span>{cat ? (locale === "en" ? cat.nameEn : cat.nameFr) : "—"}</span>
            ) : (
              <>
                <span className="badge bg-sky-100 text-sky-800">{t.wizard.newProduct}</span>
                <select className="rounded border border-stone-300 px-1 py-0.5" value={line.categoryId ?? ""} onChange={(e) => onChange({ categoryId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{t.common.category} *</option>
                  {catalog?.categories.map((c) => (
                    <option key={c.id} value={c.id}>{locale === "en" ? c.nameEn : c.nameFr}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
        <button type="button" onClick={onRemove} className="btn-ghost p-1.5 text-stone-400" aria-label={t.wizard.removeLine}>
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>

      {swap && (
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 p-2">
          <p className="mb-1 text-xs text-stone-600">{t.wizard.changeProductHint}</p>
          <div className="relative">
            <input className="input py-1.5 pr-10 text-sm" autoFocus value={swapQ} placeholder={t.wizard.searchProduct} onChange={(e) => setSwapQ(e.target.value)} />
            <button
              type="button"
              className={`absolute bottom-1 right-1 top-1 flex w-8 items-center justify-center rounded-md ${swapBrowse ? "bg-brand-100 text-brand-700" : "text-stone-500 hover:bg-stone-100"}`}
              title={t.wizard.supplierProducts}
              aria-label={t.wizard.supplierProducts}
              onClick={() => setSwapBrowse((v) => !v)}
            >
              {swapBrowse ? "▴" : "▾"}
            </button>
          </div>
          <ul className="mt-1 max-h-64 overflow-y-auto">
            {swapResults.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full justify-between px-2 py-1.5 text-left text-sm hover:bg-white"
                  onClick={() => {
                    // On remplace le produit, les quantités, température, DLC, lot et prix saisis sont gardés
                    onChange({ productId: p.id, productName: p.name, unit: p.unit, categoryId: p.categoryId, mercurialPrice: p.price, mercurialMin: p.priceMin, priceLocked: p.locked });
                    setSwap(false);
                    setSwapQ("");
                  }}
                >
                  <span>{p.name}</span><span className="text-xs text-stone-500">{p.unit}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {field("qtyOrdered", t.wizard.ordered, { inputMode: "decimal" })}
        {field("qtyReceived", t.wizard.received, { inputMode: "decimal" })}
        <div>
          <label className="mb-0.5 block text-xs font-medium text-stone-600">{t.common.unit}</label>
          <UnitSelect className="input py-2" value={line.unit} units={catalog?.units ?? DEFAULT_UNITS} onChange={(unit) => onChange({ unit })} />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {cat?.tempRequired && (
          <div>
            <label className="mb-0.5 flex items-center gap-1 text-xs font-medium text-stone-600">
              <Icon name="thermo" className="h-3.5 w-3.5" /> {t.wizard.temperature}
              <span className="text-stone-400">≤ {cat.conformMax}</span>
            </label>
            <input className={`input py-2 ${!optional && ev.issues.includes("temp_missing") ? "border-amber-400" : ""}`} inputMode="decimal" value={line.temperature} onChange={(e) => onChange({ temperature: e.target.value })} />
          </div>
        )}
        {!noDlc && (
          <div>
            <label className="mb-0.5 block text-xs font-medium text-stone-600">{t.wizard.dlc}{dlcRequired(line, catalog) && <span className="ml-0.5 text-red-600">*</span>}</label>
            <DateField className={`py-2 ${!optional && needsDlc(line, catalog) ? "border-amber-400 bg-amber-50" : ""}`} value={line.dlc} onChange={(x) => onChange({ dlc: x })} />
          </div>
        )}
        {!noDlc && field("lot", t.wizard.lot)}
        <div>
          <label className="mb-0.5 block text-xs font-medium text-stone-600">
            {t.wizard.unitPrice}<span className="ml-0.5 text-red-600">*</span>
            <span className="ml-1 font-normal text-stone-400">{rangeLabel}</span>
            {line.priceLocked && <span className="ml-1 badge bg-sky-100 text-sky-800">🔒 {t.wizard.lockedBadge}</span>}
          </label>
          <MoneyInput className={`input py-2 ${!optional && !line.unitPrice.trim() && !line.priceNotShown ? "border-amber-400 bg-amber-50" : ""}`} value={line.unitPrice} disabled={!!line.priceNotShown} onChange={(e) => onChange({ unitPrice: e.target.value })} />
          {/* Soit un prix, soit « Non indiqué sur le bon » (l'un ou l'autre pour valider le bon) */}
          <label className="mt-1 flex items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!line.priceNotShown} onChange={(e) => {
              // Prix non indiqué sur le bon : on reprend le prix du Mercurial (le prix maximum s'il y a une fourchette)
              const cp = line.productId ? catalog?.products.find((x) => x.id === line.productId) : undefined;
              const ref = line.mercurialPrice ?? line.mercurialMin ?? cp?.price ?? cp?.priceMin ?? null;
              onChange(e.target.checked ? { priceNotShown: true, unitPrice: ref != null ? String(ref).replace(".", ",") : "" } : { priceNotShown: false, unitPrice: "" });
            }} />
            {t.wizard.priceNotShown}
          </label>
          {pc.kind === "locked" && <p className="mt-0.5 text-xs font-semibold text-red-700">{fmtPct(pc.pct)} · {t.wizard.lockedWarn}</p>}
          {(pc.kind === "increase" || pc.kind === "decrease") && (
            <p className={`mt-0.5 text-xs font-semibold ${pc.kind === "increase" ? "text-red-600" : "text-emerald-600"}`}>{fmtPct(pc.pct)}</p>
          )}
          {pc.kind === "ok" && <p className="mt-0.5 text-xs text-stone-500">{t.wizard.inRange}</p>}
          {/* Produit existant sans prix : le prix saisi devient son prix, sans message ; seul un produit hors liste est signalé */}
          {pc.kind === "new" && !line.productId && <p className="mt-0.5 text-xs font-semibold text-sky-700">{t.wizard.newProduct}</p>}
        </div>
      </div>

      <div className="mt-2">
        <label className="mb-0.5 block text-xs font-medium text-stone-600">{t.wizard.note}</label>
        <input className="input py-2" value={line.note ?? ""} placeholder={t.wizard.notePh} onChange={(e) => onChange({ note: e.target.value })} />
      </div>

      {ev.issues.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {ev.issues.map((i) => (
            <li key={i} className="badge bg-stone-100 text-stone-700">
              {t.issues[i]}
              {(i === "qty_less" || i === "qty_more") && ev.qtyDiff != null && ` (${ev.qtyDiff > 0 ? "+" : ""}${ev.qtyDiff})`}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{t.wizard.productConformity} <span className="text-red-600">*</span></p>
      {/* Accepté, ou Refus et / ou Retour (indépendants) : chacun ouvre Quantité + Unité */}
      {(() => {
        const refuseOn = line.decision === "refuse";
        const returnOn = !!line.returnOn && line.decision !== "conform";
        const units = catalog?.units ?? DEFAULT_UNITS;
        const set = (refuse: boolean, ret: boolean) => onChange({
          decision: refuse ? "refuse" : ret ? "reserve" : "conform",
          decisionManual: true,
          reason: refuse || ret ? line.reason || suggestedReason(line, catalog, truckTemp) : "",
          returnOn: ret,
          ...(refuse && !refuseOn ? { refuseQty: line.refuseQty || line.qtyOrdered || line.qtyReceived, refuseUnit: line.refuseUnit || line.unit } : {}),
          ...(ret && !returnOn ? { returnQty: line.returnQty || line.qtyOrdered || line.qtyReceived, returnUnit: line.returnUnit || line.unit } : {}),
        });
        const btn = (on: boolean, cls: string) => `rounded-lg border px-2 py-2 text-sm font-semibold ${on ? cls + " border-transparent" : "border-stone-200 bg-white text-stone-500"}`;
        const fields = (kind: "refuse" | "return") => (
          <div className={`grid grid-cols-2 gap-2 rounded-lg border p-2 ${kind === "refuse" ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"}`}>
            <p className="col-span-2 text-xs font-semibold text-stone-700">{kind === "refuse" ? t.decision.refuse : t.wizard.returnBtn}</p>
            <label>
              <span className="mb-0.5 block text-xs font-medium text-stone-600">{t.wizard.returnQty}</span>
              <input className="input py-2" inputMode="decimal" value={(kind === "refuse" ? line.refuseQty : line.returnQty) ?? ""} placeholder={line.qtyOrdered || line.qtyReceived}
                onChange={(e) => onChange(kind === "refuse" ? { refuseQty: e.target.value } : { returnQty: e.target.value })} />
            </label>
            <div>
              <span className="mb-0.5 block text-xs font-medium text-stone-600">{t.common.unit}</span>
              <UnitSelect className="input py-2" value={(kind === "refuse" ? line.refuseUnit : line.returnUnit) || line.unit} units={units}
                onChange={(u) => onChange(kind === "refuse" ? { refuseUnit: u } : { returnUnit: u })} />
            </div>
          </div>
        );
        return (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => set(false, false)} className={btn(line.decision === "conform", decisionStyles.conform.badge)}>{t.wizard.accepted}</button>
              <button type="button" onClick={() => set(!refuseOn, returnOn)} className={btn(refuseOn, decisionStyles.refuse.badge)}>{t.decision.refuse}</button>
              <button type="button" onClick={() => set(refuseOn, !returnOn)} className={btn(returnOn, decisionStyles.reserve.badge)}>{t.wizard.returnBtn}</button>
            </div>
            <p className="mt-1 text-[11px] text-stone-500">{t.wizard.autoDecisionHint}</p>
            {(refuseOn || returnOn) && (
              <div className="mt-2 space-y-2">
                {refuseOn && fields("refuse")}
                {returnOn && fields("return")}
                <p className="text-[11px] text-stone-500">{t.wizard.returnHint}</p>
              </div>
            )}
          </>
        );
      })()}

      {line.decision && line.decision !== "conform" && (
        <div className="mt-3 space-y-2">
          <select className="input" value={line.reason} onChange={(e) => onChange({ reason: e.target.value as DraftLine["reason"] })}>
            <option value="">{t.wizard.chooseReason}</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{t.reasons[r]}</option>
            ))}
          </select>
          <Thumbs photos={line.photos} onRemove={async (i) => await appConfirm(t.wizard.removePhotoConfirm) && onChange({ photos: line.photos.filter((_, j) => j !== i) })} />
          <PhotoButton label={t.common.photo} className="btn-secondary w-full" onPhotos={(urls) => onChange({ photos: [...line.photos, ...urls] })} />
        </div>
      )}
    </article>
  );
}

function AddProduct({ draft, setDraft, catalog, doc }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; catalog?: Catalog; doc?: string }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [browse, setBrowse] = useState(false);
  const add = (line: DraftLine) => setDraft((d) => ({ ...d, lines: [...d.lines, { ...line, doc }] }));
  const [custom, setCustom] = useState<null | { name: string; unit: string; categoryId: string }>(null);
  const [hideSimilar, setHideSimilar] = useState(false);

  // Produits proches déjà au mercurial du fournisseur : évite de créer un doublon
  const similar = useMemo(() => {
    if (!custom || custom.name.trim().length < 3 || !catalog) return [];
    return catalog.products
      .filter((p) => p.supplierId === draft.supplierId)
      .filter((p) => matches(p.name, custom.name) || similarity(p.name, custom.name) >= 0.4)
      .slice(0, 5);
  }, [custom, catalog, draft.supplierId]);

  const results = useMemo(() => {
    if (!catalog || (!browse && q.trim().length < 2)) return [];
    const own = groupProducts(catalog.products.filter((p) => p.supplierId === draft.supplierId && (!q.trim() || matches(p.name, q)))).sort((a, b) => az(a.name, b.name));
    return browse ? own : own.slice(0, 12);
  }, [catalog, q, draft.supplierId, browse]);

  return (
    <section className="card space-y-3 border-dashed p-4">
      <h3 className="text-sm font-semibold">{t.wizard.addProduct}</h3>
      {!custom ? (
        <>
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-stone-400" />
            <input className="input pl-10 pr-12" placeholder={t.wizard.searchProduct} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setBrowse(true); } }} />
            <button
              type="button"
              className={`absolute right-1 top-1 bottom-1 flex w-10 items-center justify-center rounded-md text-lg ${browse ? "bg-brand-50 text-brand-700" : "text-stone-500 hover:bg-stone-100"}`}
              aria-label={t.wizard.supplierProducts}
              title={t.wizard.supplierProducts}
              onClick={() => setBrowse((v) => !v)}
            >
              {browse ? "▴" : "▾"}
            </button>
          </div>
          {browse && results.length === 0 && <p className="text-xs text-stone-500">{t.wizard.noSupplierProducts}</p>}
          {results.length > 0 && (
            <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-stone-50"
                    onClick={() => {
                      add(withAutoDecision(lineFromProduct(p), catalog, draft.truckTemp));
                      setQ("");
                      setBrowse(false);
                    }}
                  >
                    <span>{p.name}</span>
                    <span className="shrink-0 pl-2 text-xs text-stone-500">{p.unit}{priceRange(p, (v) => fmtMoney(v, locale)) ? ` · ${priceRange(p, (v) => fmtMoney(v, locale))}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-secondary w-full" onClick={() => setCustom({ name: q, unit: "Kg", categoryId: "" })}>
            <Icon name="plus" /> {t.wizard.outOfList}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-stone-500">{t.wizard.outOfListHint}</p>
          <input className="input" placeholder={`${t.wizard.productName} *`} value={custom.name} onChange={(e) => { setCustom({ ...custom, name: e.target.value }); setHideSimilar(false); }} />
          <div className="grid grid-cols-2 gap-2">
            <UnitSelect value={custom.unit} units={catalog?.units ?? DEFAULT_UNITS} onChange={(unit) => setCustom({ ...custom, unit })} />
            <select className="input" value={custom.categoryId} onChange={(e) => setCustom({ ...custom, categoryId: e.target.value })}>
              <option value="">{t.common.category} *</option>
              {catalog?.categories.map((c) => (
                <option key={c.id} value={c.id}>{locale === "en" ? c.nameEn : c.nameFr}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-stone-500">{t.common.supplier} : <strong>{draft.supplierName}</strong></p>
          {similar.length > 0 && !hideSimilar && (
            <div className="relative rounded-lg border border-amber-300 bg-amber-50 p-2 pr-8 text-sm">
              <button type="button" className="absolute right-1.5 top-1.5 rounded px-1.5 text-base leading-none text-amber-800 hover:bg-amber-100" aria-label={t.common.close} title={t.common.close} onClick={() => setHideSimilar(true)}>✕</button>
              <p className="mb-1 text-xs font-semibold text-amber-900">{t.mercurial.similarTitle}</p>
              <ul className="space-y-1">
                {similar.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>{p.name} <span className="text-xs text-stone-500">({p.unit})</span></span>
                    <button
                      type="button"
                      className="btn-secondary px-2 py-1 text-xs"
                      onClick={() => {
                        add(lineFromProduct(p));
                        setCustom(null);
                        setQ("");
                      }}
                    >
                      {t.mercurial.similarUse}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setCustom(null)}>{t.common.cancel}</button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!custom.name.trim() || !custom.unit.trim() || !custom.categoryId}
              onClick={() => {
                const line = lineFromProduct(null, { productName: custom.name.trim(), unit: custom.unit.trim(), categoryId: Number(custom.categoryId) });
                add(withAutoDecision(line, catalog, draft.truckTemp));
                setCustom(null);
                setQ("");
              }}
            >
              {similar.length ? t.mercurial.createAnyway : t.common.add}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Suivi boulangerie : quantités livrées, reportées dans Mercurial > Boulangerie */
function BakeryBlock({ draft, setDraft }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void }) {
  const { t } = useI18n();
  const b = draft.bakery ?? { baguette: "", hamburger: "", rolls: "", painDeMie: "" };
  return (
    <section className="card border-l-4 border-l-amber-400 p-4">
      <h3 className="font-semibold">{t.wizard.bakery}</h3>
      <p className="mb-3 text-xs text-stone-500">{t.wizard.bakeryHint}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["baguette", "hamburger", "rolls", "painDeMie"] as const).map((k) => (
          <label key={k}>
            <span className="mb-0.5 block text-xs font-medium text-stone-600">{t.bakery[k]}</span>
            <input
              className="input py-2"
              inputMode="decimal"
              value={b[k]}
              onChange={(e) => setDraft((d) => ({ ...d, bakery: { ...b, ...(d.bakery ?? {}), [k]: e.target.value } }))}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
