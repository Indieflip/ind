"use client";
import { DateField } from "@/components/DateField";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, DocRef, Draft } from "@/lib/reception-types";
import { docsOf, lineFromProduct } from "./helpers";
import { fmtDate } from "@/lib/format";
import { appConfirm } from "../Confirm";
import { Icon } from "../Icon";
import { matches } from "./helpers";

export function StepDelivery({ draft, setDraft, catalog, editId }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; catalog?: Catalog; editId?: number }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const suppliers = useMemo(() => (catalog?.suppliers ?? []).filter((s) => !q || matches(s.name, q)), [catalog, q]);
  const selected = catalog?.suppliers.find((s) => s.id === draft.supplierId);
  const [picking, setPicking] = useState(!draft.supplierId && !draft.otherSupplier);
  const listRef = useRef<HTMLUListElement>(null);

  return (
    <>
      <section className="card p-4">
        <h2 className="label">{t.wizard.chooseSupplier}</h2>
        {!picking && (selected || draft.otherSupplier) ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-3">
            <span className="font-semibold text-brand-700">{draft.otherSupplier ? `${t.wizard.otherSupplier} :` : selected?.name}</span>
            <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={() => setPicking(true)}>
              {t.common.edit}
            </button>
          </div>
        ) : (
          <>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); listRef.current?.querySelector("button")?.focus(); }}>
              <div className="relative flex-1">
                <Icon name="search" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-stone-400" />
                <input className="input pl-10" placeholder={t.wizard.searchSupplier} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button className="btn-primary shrink-0 px-3">{t.search.button}</button>
            </form>
            {!catalog && <p className="mt-2 animate-pulse text-sm text-stone-500">{t.common.loading}</p>}
            {catalog && (
            <ul ref={listRef} className="mt-2 max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-3 text-left hover:bg-stone-50 active:bg-brand-50"
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        supplierId: s.id,
                        supplierName: s.name,
                        otherSupplier: false,
                        driverName: d.supplierId === s.id && d.driverName ? d.driverName : s.drivers[0] ?? "",
                        lines: d.supplierId === s.id ? d.lines : [],
                      }));
                      setPicking(false);
                      setQ("");
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-3 text-left font-medium text-brand-700 hover:bg-stone-50"
                  onClick={() => {
                    setDraft((d) => ({ ...d, supplierId: null, supplierName: q, otherSupplier: true, lines: [] }));
                    setPicking(false);
                  }}
                >
                  + {t.wizard.otherSupplier}
                </button>
              </li>
            </ul>
            )}
          </>
        )}
        {draft.otherSupplier && !picking && (
          <input
            className="input mt-2"
            autoFocus
            placeholder={t.wizard.otherSupplierName}
            value={draft.supplierName}
            onChange={(e) => setDraft((d) => ({ ...d, supplierName: e.target.value }))}
          />
        )}
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <label className="label">{t.wizard.dateTime}</label>
          <input
            type="datetime-local"
            className="input"
            value={draft.deliveredAt}
            onChange={(e) => setDraft((d) => ({ ...d, deliveredAt: e.target.value }))}
          />
        </div>
        <Documents draft={draft} setDraft={setDraft} editId={editId} />
        {draft.kind === "reprise" && <OriginPicker draft={draft} setDraft={setDraft} catalog={catalog} />}
        {draft.kind !== "reprise" && (<>
        <div>
          <label className="label">{t.wizard.truckTemp}</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="ex. 3"
            value={draft.truckTemp}
            onChange={(e) => setDraft((d) => ({ ...d, truckTemp: e.target.value }))}
          />
          <p className="mt-1 text-xs text-stone-500">{t.wizard.truckTempHint}</p>
        </div>
        <div>
          <span className="label">{t.wizard.vehicleClean}</span>
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, vehicleClean: d.vehicleClean === v ? null : v }))}
                className={`btn border ${draft.vehicleClean === v ? (v ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-800") : "border-stone-300 bg-white"}`}
              >
                {v ? t.common.yes : t.common.no}
              </button>
            ))}
          </div>
        </div>
        </>)}
      </section>
    </>
  );
}

type Origin = { id: number; no: string; date: string; bl: string | null; lines: { productId: number | null; name: string; unit: string; categoryId: number | null; lot: string; reason: string; qty: number | null; price: number | null }[] };

/** Bon de reprise : livraison d'origine (facultatif) ; ses produits peuvent être repris d'un clic */
function OriginPicker({ draft, setDraft, catalog }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; catalog?: Catalog }) {
  const { t, locale } = useI18n();
  const R = t.returnSlip;
  const [list, setList] = useState<Origin[] | null>(null);
  useEffect(() => {
    if (!draft.supplierId && !draft.supplierName.trim() && !draft.originReceptionId) return;
    const ctl = new AbortController();
    const qs = new URLSearchParams({ supplierId: String(draft.supplierId ?? ""), supplierName: draft.supplierName, include: String(draft.originReceptionId ?? "") });
    fetch(`/api/receptions/origins?${qs}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { deliveries: [] }))
      .then((j) => setList(j.deliveries ?? []))
      .catch(() => {});
    return () => ctl.abort();
  }, [draft.supplierId, draft.supplierName, draft.originReceptionId]);
  const sel = list?.find((o) => o.id === draft.originReceptionId);
  const fmt = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  const take = (o: Origin) => setDraft((d) => {
    const have = new Set(d.lines.map((l) => l.productName.trim().toLowerCase()));
    const added = o.lines.filter((x) => !have.has(x.name.trim().toLowerCase())).map((x) => {
      const p = x.productId ? catalog?.products.find((c) => c.id === x.productId) ?? null : null;
      return lineFromProduct(p, { productId: x.productId, productName: x.name, unit: x.unit || p?.unit || "Pièce", categoryId: x.categoryId ?? p?.categoryId ?? null,
        qtyOrdered: fmt(x.qty), qtyReceived: fmt(x.qty), unitPrice: fmt(x.price), lot: x.lot, reason: x.reason, decision: "conform" });
    });
    return { ...d, lines: [...d.lines, ...added] };
  });
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <label className="block">
        <span className="label">{R.originPick}</span>
        <select className="input" value={draft.originReceptionId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, originReceptionId: Number(e.target.value) || null }))}>
          <option value="">{list ? R.originNone : R.originLoading}</option>
          {(list ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.no} · {fmtDate(o.date, locale)}{o.bl ? ` · ${o.bl}` : ""} · {o.lines.length} {R.products}</option>
          ))}
        </select>
      </label>
      {sel && (
        <button type="button" className="btn-secondary w-full" onClick={() => take(sel)}>
          <Icon name="plus" className="h-4 w-4" /> {R.originAdd} ({sel.lines.length})
        </button>
      )}
      <p className="text-xs text-stone-600">{sel ? R.originHint : R.autoAnomaly}</p>
    </div>
  );
}

/** Documents de la livraison : type (bon de livraison, facture, autre) + numéro, plusieurs possibles */
function Documents({ draft, setDraft, editId }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; editId?: number }) {
  const { t } = useI18n();
  const w = t.wizard;
  const docs = docsOf(draft);
  const update = (next: DocRef[]) =>
    setDraft((d) => ({ ...d, documents: next, blNumber: next.find((x) => x.number.trim())?.number ?? "" }));
  return (
    <div className="space-y-2">
      {docs.map((doc, i) => (
        <div key={i} className={`grid grid-cols-2 items-end gap-2 ${docs.length > 1 ? "rounded-lg border border-stone-200 p-2" : ""}`}>
          <label>
            <span className="label">{w.docType}</span>
            <select className="input" value={doc.type} onChange={(e) => update(docs.map((x, j) => (j === i ? { ...x, type: e.target.value as DocRef["type"] } : x)))}>
              <option value="bl">{w.docTypes.bl}</option>
              <option value="facture">{w.docTypes.facture}</option>
              <option value="autre">{w.docTypes.autre}</option>
            </select>
          </label>
          <label>
            <span className="label">{w.docDate}</span>
            <DateField value={doc.date ?? ""} onChange={(x) => update(docs.map((d2, j) => (j === i ? { ...d2, date: x } : d2)))} />
          </label>
          <div className="col-span-2 flex items-end gap-2">
          <label className="flex-1">
            <span className="label">{w.blNumber}</span>
            <input className="input" value={doc.number} onChange={(e) => update(docs.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
          </label>
          {docs.length > 1 && (
            <button
              type="button"
              className="btn-ghost mb-0.5 p-2 text-stone-400 hover:text-red-600"
              aria-label={t.common.delete}
              onClick={async () => { if (await appConfirm(w.removeDocConfirm)) update(docs.filter((_, j) => j !== i)); }}
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
          </div>
          <DocDuplicate draft={draft} editId={editId} number={doc.number} others={docs.filter((_, j) => j !== i).map((x) => x.number.trim())} />
        </div>
      ))}
      <button type="button" className="btn-ghost px-2 py-1 text-sm text-brand-700" onClick={() => update([...docs, { type: "facture", number: "" }])}>
        <Icon name="plus" className="h-4 w-4" /> {w.addDocument}
      </button>
      {/* BL / facture non remis : crée la fiche d'anomalie « Bon de livraison manquant » (pas pour un bon de reprise) */}
      {draft.kind !== "reprise" && <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${draft.missingBl ? "border-red-300 bg-red-50 text-red-800" : "border-stone-200 bg-white"}`}>
        <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!draft.missingBl} onChange={(e) => setDraft((d) => ({ ...d, missingBl: e.target.checked }))} />
        <span><span className="font-medium">{w.missingBlBox}</span> <span className="text-xs text-stone-500">{w.missingBlBoxHint}</span></span>
      </label>}
    </div>
  );
}

/** Avertit si le numéro est déjà utilisé (sur ce bon ou sur une autre réception du même fournisseur) */
function DocDuplicate({ draft, editId, number, others }: { draft: Draft; editId?: number; number: string; others: string[] }) {
  const { t, locale } = useI18n();
  const w = t.wizard;
  const n = number.trim();
  const [dup, setDup] = useState<null | { receptionId: number; seq: string | null; deliveredAt: string }>(null);
  useEffect(() => {
    setDup(null);
    if (!n || (!draft.supplierId && !draft.supplierName.trim())) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ number: n, supplierId: String(draft.supplierId ?? ""), supplierName: draft.supplierName, exclude: String(editId ?? "") });
      fetch(`/api/receptions/doc-check?${qs}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setDup(j?.duplicate ?? null))
        .catch(() => {});
    }, 400);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [n, draft.supplierId, draft.supplierName, editId]);
  const twice = !!n && others.some((o) => o.toLowerCase() === n.toLowerCase());
  if (!twice && !dup) return null;
  return (
    <p className="col-span-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
      {twice ? w.docTwice : (
        <>
          {w.docUsed} {dup!.seq ?? ""} {w.docUsedOf} {fmtDate(dup!.deliveredAt, locale)}.{" "}
          <Link href={`/receptions/${dup!.receptionId}`} target="_blank" className="font-semibold underline">{w.docOpen}</Link>
        </>
      )}
    </p>
  );
}
