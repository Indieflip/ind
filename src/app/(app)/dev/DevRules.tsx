"use client";

import { MODES, RESOLUTIONS, STAGES, modeIcon, stageStyles } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";

const box = "rounded-xl border border-stone-200 bg-white p-4";

/** Dev > Développement > Réclamation : types de suivi et étapes du suivi */
export function ClaimRules() {
  const { t } = useI18n();
  const r = t.rules;
  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="mb-2 font-semibold">{r.modesTitle}</h2>
        <table className="table text-sm">
          <thead><tr><th>{r.mode}</th><th>{r.meaning}</th><th>{r.impact}</th><th>{r.reminder}</th></tr></thead>
          <tbody>
            {MODES.map((m) => (
              <tr key={m}>
                <td className="font-medium">{modeIcon(m)} {t.modes[m]}</td>
                <td className="text-stone-700">{t.sheet.modeHints[m]}</td>
                <td>{r.modeImpact[m]}</td>
                <td>{r.modeReminder[m]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={box}>
        <h2 className="mb-2 font-semibold">{r.stagesTitle}</h2>
        <ul className="space-y-1.5 text-sm">
          {STAGES.map((s) => <li key={s}><span className={`badge ${stageStyles[s]}`}>{t.stages[s]}</span> {r.stageText[s]}</li>)}
        </ul>
        <h3 className="mb-1 mt-4 text-sm font-semibold">{r.resolutionsTitle}</h3>
        <ul className="space-y-1 text-sm">
          {RESOLUTIONS.map((x) => <li key={x}><strong>{t.resolutions[x]}</strong> — {r.resolutionText[x]}</li>)}
        </ul>
      </section>

    </div>
  );
}

/** Dev > Développement > Anomalie : types d'anomalie et calcul des économies */
export function AnomalyRules() {
  const { t } = useI18n();
  const r = t.rules;
  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="mb-2 font-semibold">{r.typesTitle}</h2>
        <table className="table text-sm">
          <thead><tr><th>{r.type}</th><th>{r.createdWhen}</th></tr></thead>
          <tbody>
            {(Object.keys(t.anomalies.types) as (keyof typeof t.anomalies.types)[]).map((k) => (
              <tr key={k}>
                <td className="font-medium">{t.anomalies.types[k]}</td>
                <td className="text-stone-700">{(r.typeText as Record<string, string>)[k] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={box}>
        <h2 className="mb-2 font-semibold">{r.savingsTitle}</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-stone-700">{r.savingsRules.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>

    </div>
  );
}

/** Dev > Développement technique > Développement : « Caractéristiques : Suivi » (un type de suivi par ligne) */
export function FollowUpCharacteristics() {
  const { t } = useI18n();
  const r = t.rules;
  return (
    <section>
      <h2 className="font-semibold">{r.followTitle}</h2>
      <p className="mb-2 max-w-3xl text-xs text-stone-500">{r.followIntro}</p>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="table text-sm">
          <thead><tr><th className="w-[18%]">{r.characteristic}</th><th className="w-[22%]">{r.detail}</th><th>{r.steps}</th><th className="w-[20%]">{r.reminderRule}</th></tr></thead>
          <tbody>
            {MODES.map((m) => (
              <tr key={m} className="align-top">
                <td className="font-medium">{modeIcon(m)} {t.modes[m]}</td>
                <td className="text-stone-700">{t.sheet.modeHints[m]}</td>
                <td>
                  <ol className="space-y-1.5">
                    {r.followSteps[m].map(([st, cond], i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-xs tabular-nums text-stone-400">{i + 1}.</span>
                        <span className={`badge ${stageStyles[st as "a_traiter"] ?? "bg-stone-100"}`}>{t.stages[st as "a_traiter"] ?? st}</span>
                        <span className="text-stone-700">{cond}</span>
                      </li>
                    ))}
                  </ol>
                </td>
                <td className="text-stone-700">{r.modeReminder[m]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
