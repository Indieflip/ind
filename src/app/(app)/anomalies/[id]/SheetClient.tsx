"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { followUpTodayAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { saveProblemTypesAction } from "@/lib/actions/problemTypes";
import { MODES, RESOLUTIONS, STAGES, stageOf, stageStyles, modeIcon } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";

interface Values {
  problemType: string; productId: number | null; productName: string; note: string; description: string; followUp: string; lastActionAt: string; nextActionAt: string;
  creditAmount: string; claimedAmount: string; stage: string; resolution: string; mode: string; creditNumber: string; creditDate: string; creditKind: string;
}

export function AnomalySheetForm({ id, initial, editable, informative, types, products }: { id: number; initial: Values; editable: boolean; informative?: boolean; types: string[]; products: { id: number; name: string }[] }) {
  const { t } = useI18n();
  const a = t.anomalies;
  const s = t.sheet;
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  // Après enregistrement, la fiche reprend les valeurs enregistrées (montants remis en forme…)
  const initialKey = JSON.stringify(initial);
  useEffect(() => { setV(JSON.parse(initialKey)); }, [initialKey]);
  const dirty = JSON.stringify(v) !== initialKey;
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setV({ ...v, [k]: e.target.value }); setSaved(false); };
  const today = new Date().toISOString().slice(0, 10);
  const stage = stageOf(v.stage);
  const closedWithout = stage === "cloturee" && !v.resolution;
  const [typeList, setTypeList] = useState(types);
  const [managing, setManaging] = useState(false);
  const typeOptions = v.problemType && !typeList.includes(v.problemType) ? [v.problemType, ...typeList] : typeList;
  const pickProduct = (text: string) => {
    const p = products.find((x) => x.name === text);
    setV({ ...v, productName: text, productId: p?.id ?? null });
    setSaved(false);
  };
  return (
    <>
    {/* Détail du problème */}
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{s.problemDetail}</h2>
        {!editable && <span className="text-xs text-stone-500">{s.readOnly}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="label flex items-center justify-between">{s.problemType}{editable && <button type="button" className="text-xs font-normal text-brand-700 underline" onClick={() => setManaging((m) => !m)}>{managing ? t.common.close : `⚙ ${s.manageTypes}`}</button>}</span>
          <select className="input" value={v.problemType} onChange={set("problemType")} disabled={!editable}>
            {typeOptions.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          {managing && <TypesManager list={typeList} onSaved={(l) => { setTypeList(l); if (!l.includes(v.problemType) && l.length) setV({ ...v, problemType: l[0] }); }} />}
        </div>
        <div>
          <span className="label flex items-center justify-between">{s.productLinked}{v.productId && <Link href={`/mercurial/produits/${v.productId}`} className="text-xs font-normal text-brand-700 underline">{s.seeProduct} →</Link>}</span>
          <input className="input" list={`sheet-products-${id}`} value={v.productName} onChange={(e) => pickProduct(e.target.value)} disabled={!editable} placeholder={s.productPlaceholder} />
          <datalist id={`sheet-products-${id}`}>{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          {v.productName && !v.productId && <span className="mt-1 block text-xs text-amber-700">{s.productNotLinked}</span>}
        </div>
      </div>
      <label className="block">
        <span className="label">{a.problem}</span>
        <textarea className="input" rows={2} value={v.description} onChange={set("description")} disabled={!editable} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <label>
          <span className="label">{s.claimed}</span>
          <MoneyInput value={v.claimedAmount} onChange={set("claimedAmount")} disabled={!editable} />
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

      {stage === "cloturee" && (
        <div>
          <span className="label">{s.resolution} *</span>
          <div className="grid grid-cols-3 gap-2">
            {RESOLUTIONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={!editable}
                onClick={() => { setV({ ...v, resolution: r }); setSaved(false); }}
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
              <label><span className="label">{(v.creditKind || "avoir") === "facture" ? s.invoiceDate : s.creditDate}</span><input type="date" className="input" value={v.creditDate} onChange={set("creditDate")} disabled={!editable} /></label>
              {!v.creditAmount.trim() && <p className="text-xs text-amber-700 sm:col-span-3">{s.creditMissing}</p>}
            </div>
          )}
        </div>
      )}

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
              <span className="block text-[11px] font-normal text-stone-500">{s.modeHints[m]}</span>
            </button>
          ))}
        </div>
      </div>

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

      <label className="block max-w-xs">
        <span className="label">{a.lastAction}</span>
        <div className="flex gap-1.5">
          <input type="date" className="input" value={v.lastActionAt} onChange={set("lastActionAt")} disabled={!editable} />
          {editable && <button type="button" className="btn-secondary shrink-0 px-2 text-xs" onClick={() => setV({ ...v, lastActionAt: today })}>{s.today}</button>}
        </div>
      </label>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !dirty || !v.description.trim() || closedWithout}
            onClick={() => start(async () => {
              const { productName: _n, ...rest } = v;
              void _n;
              const res = await updateAnomalyAction(id, { ...rest, ...(v.productId ? {} : { productId: null }) });
              if (res?.ok) { setSaved(true); router.refresh(); }
            })}
          >
            <Icon name="check" className="h-4 w-4" /> {t.common.save}
          </button>
          {dirty && <button type="button" className="btn-ghost" onClick={() => setV(initial)}>{t.common.cancel}</button>}
          {saved && !dirty && <span className="text-sm text-emerald-700">{s.saved}</span>}
        </div>
      )}
    </section>
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
