"use client";

import { MODES, RESOLUTIONS, STAGES, modeIcon, stageStyles } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { ConformityRow } from "../settings/SettingsClient";

export interface CategoryRule { id: number; name: string; conformRules: string; reserveRules: string; refuseRules: string }

/** Règles de gestion de l'application (lecture) : types de suivi et impact sur les économies, étapes, types d'anomalie */
export function DevRules({ categories = [], canEdit = false }: { categories?: CategoryRule[]; canEdit?: boolean }) {
  const { t } = useI18n();
  const r = t.rules;
  const box = "card p-4";
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

      <section className={box}>
        <h2 className="mb-1 font-semibold">{r.categoriesTitle}</h2>
        <p className="mb-3 text-sm text-stone-600">{r.categoriesIntro}</p>
        <div className="overflow-x-auto">
          <table className="table text-sm">
            <thead><tr><th>{r.category}</th><th className="text-emerald-800">{t.wizard.accepted}</th><th className="text-sky-800">{t.protocols.acceptedWithGap}</th><th className="text-red-700">{t.decision.refuse}</th></tr></thead>
            <tbody>
              {categories.map((c) =>
                canEdit ? (
                  <ConformityRow key={c.id} c={c} />
                ) : (
                  <tr key={c.id} className="align-top">
                    <td className="font-medium">{c.name}</td>
                    {[c.conformRules, c.reserveRules, c.refuseRules].map((rules, i) => (
                      <td key={i}><ul className="list-disc space-y-0.5 pl-4">{rules.split(/\r?\n/).filter((x) => x.trim()).map((x, j) => <li key={j}>{x}</li>)}</ul></td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={box}>
        <h2 className="mb-2 font-semibold">{r.otherTitle}</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-stone-700">{r.otherRules.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
    </div>
  );
}
