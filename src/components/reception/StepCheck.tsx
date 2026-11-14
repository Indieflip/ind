"use client";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { REASONS, type Catalog, type Draft, type DraftLine } from "@/lib/reception-types";
import type { Decision } from "@/lib/rules";
import { fmtMoney, fmtPct } from "@/lib/format";
import { decisionStyles } from "../DecisionBadge";
import { Icon } from "../Icon";
import { UnitSelect } from "../UnitSelect";
import { PhotoButton, Thumbs } from "./PhotoButton";
import { evaluate, isBakerySupplier, lineFromProduct, matches, priceCheck, withAutoDecision } from "./helpers";

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
  return (
    <>
      <a href="/protocoles" target="_blank" className="flex items-center gap-2 text-sm font-medium text-brand-700 underline">
        <Icon name="book" className="h-4 w-4" /> {t.wizard.weighProtocol}
      </a>
      {bakery && <BakeryBlock draft={draft} setDraft={setDraft} />}
      {draft.lines.length === 0 && <p className="card p-4 text-center text-sm text-stone-500">{t.wizard.noProducts}</p>}
      {draft.lines.map((l) => (
        <LineCard
          key={l.key}
          line={l}
          catalog={catalog}
          onChange={(patch) => updateLine(l.key, patch)}
          onRemove={() => confirm(t.wizard.removeLineConfirm) && setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))}
        />
      ))}
      <AddProduct draft={draft} setDraft={setDraft} catalog={catalog} />
    </>
  );
}

function LineCard({
  line,
  catalog,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  catalog?: Catalog;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  const ev = evaluate(line, catalog);
  const pc = priceCheck(line);
  const lo = line.mercurialMin ?? line.mercurialPrice;
  const hi = line.mercurialPrice ?? line.mercurialMin;
  const rangeLabel = lo == null ? "" : `${t.wizard.mercurial} ${fmtMoney(lo, locale)}${hi != null && hi !== lo ? ` – ${fmtMoney(hi, locale)}` : ""}`;
  const style = decisionStyles[line.decision];

  const field = (key: keyof DraftLine, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-stone-600">{label}</label>
      <input className="input py-2" value={String(line[key] ?? "")} onChange={(e) => onChange({ [key]: e.target.value } as Partial<DraftLine>)} {...props} />
    </div>
  );

  return (
    <article className={`card border-l-4 ${style.border} p-4`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {line.productId ? (
            <h3 className="font-semibold leading-tight">{line.productName}</h3>
          ) : (
            <input className="input py-1.5 font-semibold" value={line.productName} placeholder={t.wizard.productName} onChange={(e) => onChange({ productName: e.target.value })} />
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
            <input className={`input py-2 ${ev.issues.includes("temp_missing") ? "border-amber-400" : ""}`} inputMode="decimal" value={line.temperature} onChange={(e) => onChange({ temperature: e.target.value })} />
          </div>
        )}
        {field("dlc", t.wizard.dlc, { type: "date" })}
        {field("lot", t.wizard.lot)}
        <div>
          <label className="mb-0.5 block text-xs font-medium text-stone-600">
            {t.wizard.unitPrice}
            <span className="ml-1 font-normal text-stone-400">{rangeLabel}</span>
            {line.priceLocked && <span className="ml-1 badge bg-sky-100 text-sky-800">🔒 {t.wizard.lockedBadge}</span>}
          </label>
          <input className="input py-2" inputMode="decimal" value={line.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
          {pc.kind === "locked" && <p className="mt-0.5 text-xs font-semibold text-red-700">{fmtPct(pc.pct)} · {t.wizard.lockedWarn}</p>}
          {(pc.kind === "increase" || pc.kind === "decrease") && (
            <p className={`mt-0.5 text-xs font-semibold ${pc.kind === "increase" ? "text-red-600" : "text-emerald-600"}`}>{fmtPct(pc.pct)}</p>
          )}
          {pc.kind === "ok" && <p className="mt-0.5 text-xs text-stone-500">{t.wizard.inRange}</p>}
          {pc.kind === "new" && <p className="mt-0.5 text-xs font-semibold text-sky-700">{t.wizard.newProduct}</p>}
        </div>
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

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {(["conform", "reserve", "refuse"] as Decision[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange({ decision: d, decisionManual: true, reason: d === "conform" ? "" : line.reason })}
            className={`rounded-lg border px-2 py-2 text-sm font-semibold ${line.decision === d ? decisionStyles[d].badge + " border-transparent" : "border-stone-200 bg-white text-stone-500"}`}
          >
            {t.decision[d]}
          </button>
        ))}
      </div>
      {line.decisionManual && (
        <button type="button" className="mt-1 text-xs text-stone-500 underline" onClick={() => onChange({ decisionManual: false })}>
          {t.wizard.autoDecision}
        </button>
      )}

      {line.decision !== "conform" && (
        <div className="mt-3 space-y-2">
          <select className="input" value={line.reason} onChange={(e) => onChange({ reason: e.target.value as DraftLine["reason"] })}>
            <option value="">{t.wizard.chooseReason}</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{t.reasons[r]}</option>
            ))}
          </select>
          <Thumbs photos={line.photos} onRemove={(i) => confirm(t.wizard.removePhotoConfirm) && onChange({ photos: line.photos.filter((_, j) => j !== i) })} />
          <PhotoButton label={t.common.photo} className="btn-secondary w-full" onPhotos={(urls) => onChange({ photos: [...line.photos, ...urls] })} />
        </div>
      )}
    </article>
  );
}

function AddProduct({ draft, setDraft, catalog }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; catalog?: Catalog }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState<null | { name: string; unit: string; categoryId: string }>(null);

  const results = useMemo(() => {
    if (!catalog || q.trim().length < 2) return [];
    const own = catalog.products.filter((p) => p.supplierId === draft.supplierId && matches(p.name, q));
    return own.slice(0, 12);
  }, [catalog, q, draft.supplierId]);

  return (
    <section className="card space-y-3 border-dashed p-4">
      <h3 className="text-sm font-semibold">{t.wizard.addProduct}</h3>
      {!custom ? (
        <>
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-stone-400" />
            <input className="input pl-10" placeholder={t.wizard.searchProduct} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {results.length > 0 && (
            <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-stone-50"
                    onClick={() => {
                      setDraft((d) => ({ ...d, lines: [...d.lines, withAutoDecision(lineFromProduct(p), catalog)] }));
                      setQ("");
                    }}
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-stone-500">{p.unit} · {fmtMoney(p.price, locale)}</span>
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
          <input className="input" placeholder={`${t.wizard.productName} *`} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
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
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setCustom(null)}>{t.common.cancel}</button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!custom.name.trim() || !custom.unit.trim() || !custom.categoryId}
              onClick={() => {
                const line = lineFromProduct(null, { productName: custom.name.trim(), unit: custom.unit.trim(), categoryId: Number(custom.categoryId) });
                setDraft((d) => ({ ...d, lines: [...d.lines, withAutoDecision(line, catalog)] }));
                setCustom(null);
                setQ("");
              }}
            >
              {t.common.add}
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
