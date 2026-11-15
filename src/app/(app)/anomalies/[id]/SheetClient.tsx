"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateAnomalyAction } from "@/lib/actions/anomalies";
import { OUTCOMES, outcomeOf, outcomeStyles } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";

interface Values { nature: string; description: string; followUp: string; lastActionAt: string; nextActionAt: string; result: string; creditAmount: string; status: string }

const NATURES = ["Viande", "Poisson", "Fruits & Légumes", "Crèmerie", "Épicerie", "Boisson", "Boulangerie", "Hygiène", "Autre"];

export function AnomalySheetForm({ id, initial, editable }: { id: number; initial: Values; editable: boolean }) {
  const { t } = useI18n();
  const a = t.anomalies;
  const s = t.sheet;
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  // Après enregistrement, la fiche reprend les valeurs enregistrées (montants remis en forme…)
  const initialKey = JSON.stringify(initial);
  useEffect(() => { setV(JSON.parse(initialKey)); }, [initialKey]);
  const dirty = JSON.stringify(v) !== initialKey;
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setV({ ...v, [k]: e.target.value }); setSaved(false); };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{s.followUp}</h2>
        {!editable && <span className="text-xs text-stone-500">{s.readOnly}</span>}
      </div>

      <label className="block">
        <span className="label">{a.problem}</span>
        <textarea className="input" rows={2} value={v.description} onChange={set("description")} disabled={!editable} />
      </label>

      <label className="block">
        <span className="label">{a.action}</span>
        <textarea className="input" rows={4} value={v.followUp} onChange={set("followUp")} disabled={!editable} placeholder={s.actionPlaceholder} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">{a.lastAction}</span>
          <div className="flex gap-1.5">
            <input type="date" className="input" value={v.lastActionAt} onChange={set("lastActionAt")} disabled={!editable} />
            {editable && <button type="button" className="btn-secondary shrink-0 px-2 text-xs" onClick={() => setV({ ...v, lastActionAt: today })}>{s.today}</button>}
          </div>
        </label>
        <label><span className="label">{a.nature}</span><input className="input" list="sheet-natures" value={v.nature} onChange={set("nature")} disabled={!editable} /></label>
        <datalist id="sheet-natures">{NATURES.map((x) => <option key={x} value={x} />)}</datalist>
      </div>

      <div>
        <span className="label">{a.result}</span>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map((o) => {
            const on = outcomeOf(v.result) === o;
            return (
              <button
                key={o}
                type="button"
                disabled={!editable}
                onClick={() => { setV({ ...v, result: o }); setSaved(false); }}
                className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition ${on ? `${outcomeStyles[o]} border-current` : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"}`}
              >
                {a.outcomes[o]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">{a.saving}</span><MoneyInput value={v.creditAmount} onChange={set("creditAmount")} disabled={!editable} /></label>
        <label>
          <span className="label">{t.common.status}</span>
          <select className="input" value={v.status} onChange={set("status")} disabled={!editable}>
            {Object.entries(a.statuses).map(([k, x]) => <option key={k} value={k}>{x}</option>)}
          </select>
        </label>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !dirty || !v.description.trim()}
            onClick={() => start(async () => {
              const res = await updateAnomalyAction(id, v);
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
  );
}
