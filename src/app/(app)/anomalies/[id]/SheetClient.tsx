"use client";
import { DateField } from "@/components/DateField";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { followUpTodayAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { saveProblemTypesAction } from "@/lib/actions/problemTypes";
import { MODES, RESOLUTIONS, STAGES, stageOf, stageStyles, modeIcon } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";
import { UnitSelect } from "@/components/UnitSelect";
import { ProductCombo } from "@/components/ProductCombo";

export interface Item { productId: number | null; name: string; qty: string; unit: string; price: string }
interface Values {
  items: Item[];
  problemType: string; productId: number | null; productName: string; note: string; description: string; followUp: string; lastActionAt: string; nextActionAt: string;
  creditAmount: string; claimedAmount: string; stage: string; resolution: string; mode: string; creditNumber: string; creditDate: string; creditKind: string; docDate: string;
}

export function AnomalySheetForm({ id, initial, editable, informative, types, products, assistant = [], showAssistant = true, units = [], supplier, document, missingBlType }: { supplier?: { id: number | null; name: string }; document?: { label: string; href: string | null } | null; missingBlType?: string; units?: string[]; id: number; initial: Values; editable: boolean; informative?: boolean; types: string[]; products: { id: number; name: string; unit?: string; price?: number | null }[]; assistant?: { date: string | null; text: string }[]; showAssistant?: boolean }) {
  const { t } = useI18n();
  const a = t.anomalies;
  const s = t.sheet;
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  // Après enregistrement, la fiche reprend les valeurs enregistrées (montants remis en forme…)
  const initialKey = JSON.stringify(initial);
  useEffect(() => { setV(JSON.parse(initialKey)); }, [initialKey]);
  const dirty = JSON.stringify(v) !== initialKey;
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setV({ ...v, [k]: e.target.value }); setSaved(false); setError(""); };
  const today = new Date().toISOString().slice(0, 10);
  const stage = stageOf(v.stage);
  const closedWithout = stage === "cloturee" && !v.resolution;
  const [typeList, setTypeList] = useState(types);
  const [managing, setManaging] = useState(false);
  const typeOptions = v.problemType && !typeList.includes(v.problemType) ? [v.problemType, ...typeList] : typeList;
  // Produits de la fiche : quantité et prix par produit
  const setItem = (i: number, patch: Partial<Item>) => { setV({ ...v, items: v.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }); setSaved(false); };
  // Prix du Mercurial repris seulement si l'unité de la ligne est celle du produit (ex. dorade au Kg ≠ à la Pièce)
  const productOf = (it: Item) => (it.productId ? products.find((x) => x.id === it.productId) : undefined);
  const priceStr = (p?: { price?: number | null }) => (p?.price != null ? String(p.price).replace(".", ",") : "");

  const pickProduct = (i: number, name: string, p: { id: number; unit?: string; price?: number | null } | null) => {
    const cur = v.items[i];
    const unit = cur.unit || canonUnit(p?.unit ?? "");
    const sameUnit = !!p && key(unit) === key(p.unit ?? "");
    setItem(i, { name, productId: p?.id ?? null, unit, ...(p && !cur.price && sameUnit ? { price: priceStr(products.find((y) => y.id === p.id)) } : {}) });
  };
  const changeUnit = (i: number, u: string) => {
    const it = v.items[i];
    const p = productOf(it);
    if (p && key(u) !== key(p.unit ?? "") && it.price === priceStr(p)) return setItem(i, { unit: u, price: "" });
    if (p && key(u) === key(p.unit ?? "") && !it.price) return setItem(i, { unit: u, price: priceStr(p) });
    setItem(i, { unit: u });
  };
  const unitMismatch = (it: Item) => { const p = productOf(it); return !!p && !!it.unit && !!p.unit && key(it.unit) !== key(p.unit); };
  const n = (x: string) => { const r = parseFloat(x.replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(r) ? r : null; };
  // Unité tapée à la main (« kg », « Pièce ») rattachée à l'unité existante de même nom
  const key = (u: string) => u.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const canonUnit = (u: string) => units.find((x) => key(x) === key(u)) ?? u;
  const itemsTotal = v.items.reduce((sum, x) => sum + (n(x.qty) ?? 0) * (n(x.price) ?? 0), 0);
  // Bon de livraison manquant : le montant est le total des produits (calculé, non saisi)
  const isMissingBl = !!missingBlType && v.problemType === missingBlType;
  // Montant réclamé = somme des produits (quantité × prix) dès qu'un produit a un prix ; sinon saisi à la main (BL manquant : toujours calculé)
  const amountFromItems = isMissingBl || itemsTotal > 0;
  // Enregistrer : on dit toujours ce qui se passe (champ manquant, erreur, ou fiche enregistrée)
  const save = () => {
    setError("");
    if (!v.description.trim()) return setError(s.problemRequired);
    if (closedWithout) return setError(s.resolutionNeeded);
    start(async () => {
      try {
        const { productName: _n, productId: _p, items, ...rest } = v;
        void _n; void _p;
        const res = await updateAnomalyAction(id, {
          ...rest,
          ...(amountFromItems ? { claimedAmount: itemsTotal ? itemsTotal.toFixed(2) : "" } : {}),
          items: items.map((x) => ({ productId: x.productId, name: x.name, qty: n(x.qty), unit: x.unit, price: n(x.price) })),
        });
        if (res?.ok) { setSaved(true); router.refresh(); }
        else setError(s.saveFailed);
      } catch {
        setError(s.saveFailed);
      }
    });
  };
  return (
    <>
    {/* Détail du problème */}
    <section className="card space-y-4 p-5">
      {!editable && <p className="text-xs text-stone-500">{s.readOnly}</p>}
      {supplier && (
        <dl className="grid gap-3 rounded-lg bg-stone-50 p-3 text-sm sm:grid-cols-3">
          <div><dt className="label">{t.common.supplier}</dt><dd className="font-medium">{supplier.id ? <Link href={`/mercurial/fournisseurs/${supplier.id}`} className="text-brand-700 hover:underline">{supplier.name}</Link> : supplier.name}</dd></div>
          <div><dt className="label">{a.blInvoice}</dt><dd className="font-medium">{document?.href ? <Link href={document.href} className="text-brand-700 hover:underline">{document.label}</Link> : document?.label || "—"}</dd></div>
          <div>
            <dt className="label">{s.docDate}</dt>
            <dd>{editable ? <DateField className="py-1 text-sm" value={v.docDate} onChange={(x) => { setV({ ...v, docDate: x }); setSaved(false); }} /> : <span className="font-medium">{v.docDate ? v.docDate.split("-").reverse().map((x, i) => (i === 2 ? x.slice(2) : x)).join("/") : "—"}</span>}</dd>
          </div>
        </dl>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="label flex items-center justify-between">{s.problemType}{editable && <button type="button" className="text-xs font-normal text-brand-700 underline" onClick={() => setManaging((m) => !m)}>{managing ? t.common.close : `⚙ ${s.manageTypes}`}</button>}</span>
          <select className="input" value={v.problemType} onChange={set("problemType")} disabled={!editable}>
            {typeOptions.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          {managing && <TypesManager list={typeList} onSaved={(l) => { setTypeList(l); if (!l.includes(v.problemType) && l.length) setV({ ...v, problemType: l[0] }); }} />}
        </div>
      </div>
      <div>
        <span className="label">{s.items}</span>
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="table text-sm">
            <thead><tr><th>{s.productLinked}</th><th className="w-24 text-right">{s.qty}</th><th className="w-20">{s.unit}</th><th className="w-28 text-right">{s.unitPrice}</th><th className="w-24 text-right">{s.lineTotal}</th><th className="w-10" /></tr></thead>
            <tbody>
              {v.items.map((x, i) => (
                <tr key={i}>
                  <td>
                    {/* Saisie du produit : suggestions des produits du fournisseur au fil de la frappe */}
                    <ProductCombo value={x.name} products={products} disabled={!editable} placeholder={s.productPlaceholder} onChange={(name, p) => pickProduct(i, name, p)} />
                    {x.productId ? <Link href={`/mercurial/produits/${x.productId}`} className="mt-0.5 block text-[11px] text-brand-700 underline">{s.seeProduct} →</Link> : x.name ? <span className="mt-0.5 block text-[11px] text-amber-700">{s.productNotLinked}</span> : null}
                  </td>
                  <td><input className="input py-1.5 text-right text-sm" inputMode="decimal" value={x.qty} onChange={(e) => setItem(i, { qty: e.target.value })} disabled={!editable} /></td>
                  <td>{editable ? <UnitSelect className="input py-1.5 text-sm" value={canonUnit(x.unit)} units={units} onChange={(u) => changeUnit(i, u)} /> : <span>{x.unit}</span>}</td>
                  <td>
                    <MoneyInput className="input py-1.5 text-right text-sm" value={x.price} onChange={(e) => setItem(i, { price: e.target.value })} disabled={!editable} />
                    {unitMismatch(x) && <span className="mt-0.5 block text-[11px] leading-tight text-amber-700">{s.unitMismatch} ({productOf(x)?.unit})</span>}
                  </td>
                  <td className="text-right tabular-nums">{n(x.qty) != null && n(x.price) != null ? `${((n(x.qty) ?? 0) * (n(x.price) ?? 0)).toFixed(2).replace(".", ",")} €` : "—"}</td>
                  <td>{editable && <button type="button" className="btn-ghost p-1 text-stone-400 hover:text-red-600" aria-label={t.common.delete} onClick={() => { setV({ ...v, items: v.items.filter((_, j) => j !== i) }); setSaved(false); }}><Icon name="trash" className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          {editable && <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => { setV({ ...v, items: [...v.items, { productId: null, name: "", qty: "", unit: "", price: "" }] }); setSaved(false); }}><Icon name="plus" className="h-4 w-4" /> {s.addItem}</button>}
          {itemsTotal > 0 && <span className="font-semibold">{s.itemsTotal} : {itemsTotal.toFixed(2).replace(".", ",")} €</span>}
        </div>
      </div>
      <label className="block">
        <span className="label">{a.problem}</span>
        <textarea className="input" rows={2} value={v.description} onChange={set("description")} disabled={!editable} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <label>
          <span className="label">{missingBlType && v.problemType === missingBlType ? s.amountOnly : s.claimed}</span>
          {amountFromItems ? (
            <div className="input bg-stone-50 text-right font-semibold tabular-nums" title={s.amountFromItems}>{itemsTotal.toFixed(2).replace(".", ",")} €</div>
          ) : (
            <MoneyInput value={v.claimedAmount} onChange={set("claimedAmount")} disabled={!editable} />
          )}
          {amountFromItems && <span className="mt-1 block text-xs text-stone-500">{s.amountFromItems}</span>}
          {informative && <span className="mt-1 block text-xs text-sky-700">ℹ {s.informative}</span>}
        </label>
        <label className="block">
          <span className="label">{s.note}</span>
          <textarea className="input" rows={2} value={v.note} onChange={set("note")} disabled={!editable} placeholder={s.notePlaceholder} />
        </label>
      </div>
    </section>

    {/* Suivi */}
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">{s.followUp}</h2>

      {/* Étape du suivi */}
      <div>
        <span className="label">{t.common.status}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STAGES.map((st) => (
            <button
              key={st}
              type="button"
              disabled={!editable}
              onClick={() => { setV({ ...v, stage: st, resolution: st === "cloturee" ? v.resolution : "" }); setSaved(false); }}
              className={`rounded-lg border-2 px-2 py-2 text-sm font-semibold transition ${stage === st ? `${stageStyles[st]} border-current` : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"}`}
            >
              {t.stages[st]}
            </button>
          ))}
        </div>
      </div>

      {/* Type de suivi : en deuxième, juste après le statut */}
      <div>
        <span className="label">{s.mode}</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={!editable}
              onClick={() => { setV({ ...v, mode: m }); setSaved(false); }}
              className={`rounded-lg border-2 px-2 py-2 text-left text-sm ${v.mode === m ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-stone-200 bg-white text-stone-500"}`}
            >
              {modeIcon(m)} {t.modes[m]}
              {m === "reclamation" && <span className="block text-[11px] font-normal text-stone-500">{s.modeHints[m]}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Résolution : toujours visible ; en choisir une clôture la fiche */}
      {(
        <div>
          <span className="label">{s.resolution}</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RESOLUTIONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={!editable}
                onClick={() => { setV({ ...v, resolution: r, stage: "cloturee" }); setSaved(false); }}
                className={`rounded-lg border-2 px-2 py-2 text-sm font-semibold ${v.resolution === r ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-500"}`}
              >
                {t.resolutions[r]}
              </button>
            ))}
          </div>
          {closedWithout && <p className="mt-1 text-xs text-amber-700">{s.resolutionNeeded}</p>}
          {v.resolution === "avoir" && (
            <div id="avoir" className="mt-3 grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 sm:grid-cols-3">
              {/* L'argent revient soit par un avoir, soit par une régularisation sur une facture */}
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                {(["avoir", "facture"] as const).map((k) => (
                  <button key={k} type="button" disabled={!editable} onClick={() => { setV({ ...v, creditKind: k }); setSaved(false); }} className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold ${(v.creditKind || "avoir") === k ? "border-emerald-600 bg-white text-emerald-800" : "border-stone-200 bg-white text-stone-500"}`}>
                    {s.creditKinds[k]}
                  </button>
                ))}
              </div>
              <label><span className="label">{s.creditAmount} *</span><MoneyInput value={v.creditAmount} onChange={set("creditAmount")} disabled={!editable} /></label>
              <label><span className="label">{(v.creditKind || "avoir") === "facture" ? s.invoiceNumber : s.creditNumber}</span><input className="input" value={v.creditNumber} onChange={set("creditNumber")} disabled={!editable} placeholder="AV-12345" /></label>
              <label><span className="label">{(v.creditKind || "avoir") === "facture" ? s.invoiceDate : s.creditDate}</span><DateField value={v.creditDate} onChange={(x) => { setV({ ...v, creditDate: x }); setSaved(false); }} disabled={!editable} /></label>
              {!v.creditAmount.trim() && <p className="text-xs text-amber-700 sm:col-span-3">{s.creditMissing}</p>}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block">
          <span className="label">{s.userAction}</span>
          <textarea className="input" rows={4} value={v.followUp} onChange={set("followUp")} disabled={!editable} placeholder={s.actionPlaceholder} />
        </label>
        {editable && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input className="input max-w-sm flex-1 py-1.5 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={s.followUpNote} />
            <button
              type="button"
              className="btn-secondary py-1.5 text-sm"
              disabled={pending || dirty}
              title={dirty ? s.saveFirst : undefined}
              onClick={() => start(async () => { await followUpTodayAction(id, note); setNote(""); router.refresh(); })}
            >
              📞 {s.followedToday}
            </button>
          </div>
        )}
      </div>

      {/* Actions Assistant : remplies par l'application, non modifiables */}
      {showAssistant && <div>
        <span className="label">🤖 {s.assistantTitle}</span>
        <ul className="space-y-1 rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm text-violet-950">
          {assistant.map((x, i) => (
            <li key={i} className="flex gap-2">{x.date && <span className="w-16 shrink-0 tabular-nums text-violet-700">{x.date}</span>}<span>{x.text}</span></li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-stone-500">{s.assistantHint}</p>
      </div>}

      <label className="block max-w-xs">
        <span className="label">{a.lastAction}</span>
        <DateField today value={v.lastActionAt} onChange={(x) => { setV({ ...v, lastActionAt: x }); setSaved(false); }} disabled={!editable} />
      </label>

    </section>
      {/* Barre d'enregistrement : toujours visible en bas de l'écran dès qu'une modification est en cours */}
      {editable && (dirty || saved || error) && (
        <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          {dirty && (
            <>
              <button type="button" className="btn-primary" disabled={pending} onClick={save}>
                <Icon name="check" className="h-4 w-4" /> {pending ? s.saving : t.common.save}
              </button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => { setV(initial); setError(""); }}>{t.common.cancel}</button>
              {!error && <span className="text-sm text-amber-700">{s.unsaved}</span>}
            </>
          )}
          {error && <span className="text-sm font-medium text-red-700">⚠ {error}</span>}
          {saved && !dirty && !error && <span className="text-sm font-semibold text-emerald-700">✓ {s.saved}</span>}
        </div>
      )}
    </>
  );
}

/** Gérer la liste des types de problème : renommer, ajouter, supprimer */
function TypesManager({ list, onSaved }: { list: string[]; onSaved: (l: string[]) => void }) {
  const { t } = useI18n();
  const s = t.sheet;
  const [rows, setRows] = useState(list.map((x) => ({ from: x, to: x })));
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-stone-200 bg-stone-50 p-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1.5">
          <input className="input py-1 text-sm" value={r.to} onChange={(e) => { setRows(rows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x))); setDone(false); }} />
          <button type="button" className="btn-ghost px-2 text-stone-400 hover:text-red-600" aria-label={t.common.delete} onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDone(false); }}><Icon name="trash" className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setRows([...rows, { from: "", to: "" }])}>+ {s.addType}</button>
        <button type="button" className="btn-primary py-1 text-xs" disabled={pending} onClick={() => start(async () => {
          const res = await saveProblemTypesAction(rows.map((r) => r.to), rows.filter((r) => r.from && r.to.trim() && r.from !== r.to.trim()).map((r) => ({ from: r.from, to: r.to.trim() })));
          if (res.ok) { onSaved(res.list); setRows(res.list.map((x) => ({ from: x, to: x }))); setDone(true); }
        })}>{t.common.save}</button>
        {done && <span className="text-xs text-emerald-700">{s.saved}</span>}
      </div>
    </div>
  );
}
