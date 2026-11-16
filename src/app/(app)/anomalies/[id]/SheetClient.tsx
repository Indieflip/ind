"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { followUpTodayAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { MODES, RESOLUTIONS, STAGES, stageOf, stageStyles } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { MoneyInput } from "@/components/MoneyInput";

interface Values {
  nature: string; description: string; followUp: string; lastActionAt: string; nextActionAt: string;
  creditAmount: string; claimedAmount: string; stage: string; resolution: string; mode: string;
}

const NATURES = ["Viande", "Poisson", "Fruits & Légumes", "Crèmerie", "Épicerie", "Boisson", "Boulangerie", "Hygiène", "Autre"];

export function AnomalySheetForm({ id, initial, editable }: { id: number; initial: Values; editable: boolean }) {
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
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{s.followUp}</h2>
        {!editable && <span className="text-xs text-stone-500">{s.readOnly}</span>}
      </div>

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
        </div>
      )}

      <div>
        <span className="label">{s.mode}</span>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={!editable}
              onClick={() => { setV({ ...v, mode: m }); setSaved(false); }}
              className={`rounded-lg border-2 px-2 py-2 text-left text-sm ${v.mode === m ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-stone-200 bg-white text-stone-500"}`}
            >
              {m === "verification" ? "🔍" : "📞"} {t.modes[m]}
              <span className="block text-[11px] font-normal text-stone-500">{s.modeHints[m]}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">{a.problem}</span>
        <textarea className="input" rows={2} value={v.description} onChange={set("description")} disabled={!editable} />
      </label>

      <div>
        <label className="block">
          <span className="label">{a.action}</span>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">{s.claimed}</span><MoneyInput value={v.claimedAmount} onChange={set("claimedAmount")} disabled={!editable} /></label>
        <label><span className="label">{a.saving}</span><MoneyInput value={v.creditAmount} onChange={set("creditAmount")} disabled={!editable} /></label>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !dirty || !v.description.trim() || closedWithout}
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
