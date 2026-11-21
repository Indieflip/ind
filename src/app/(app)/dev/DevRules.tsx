"use client";

import { MODES, RESOLUTIONS, STAGES, modeIcon, stageStyles } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { DataTable, type Col } from "@/components/table/DataTable";

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

/** Dev > Développement technique > Développement : « Caractéristiques : Suivi » (types de suivi et étapes), filtrable par l'en-tête */
type CharRow = { id: string; characteristic: string; post: string; detail: string; steps: [string, string][]; reminder: string };
export function FollowUpCharacteristics() {
  const { t } = useI18n();
  const r = t.rules;
  const rows: CharRow[] = [
    ...MODES.map((m) => ({ id: `mode-${m}`, characteristic: r.charMode, post: `${modeIcon(m)} ${t.modes[m]}`, detail: t.sheet.modeHints[m], steps: r.followSteps[m] as unknown as [string, string][], reminder: r.modeReminder[m] })),
    ...STAGES.map((st) => ({ id: `stage-${st}`, characteristic: r.charStage, post: t.stages[st], detail: r.stageText[st], steps: [] as [string, string][], reminder: r.stageReminder[st] })),
  ];
  const cols: Col<CharRow>[] = [
    { key: "characteristic", label: r.characteristic, text: (x) => x.characteristic, keepCase: true, width: "12%", className: "font-medium" },
    { key: "post", label: r.post, text: (x) => x.post, keepCase: true, width: "16%", className: "font-medium",
      render: (x) => (x.id.startsWith("stage-") ? <span className={`badge ${stageStyles[x.id.slice(6) as "a_traiter"]}`}>{x.post}</span> : x.post) },
    { key: "detail", label: r.detail, text: (x) => x.detail, keepCase: true, width: "20%", className: "text-stone-700" },
    { key: "steps", label: r.steps, text: (x) => x.steps.map(([st, c]) => `${t.stages[st as "a_traiter"] ?? st} ${c}`).join(" "), keepCase: true, sortable: false,
      render: (x) => (x.steps.length ? (
        <ol className="space-y-1">
          {x.steps.map(([st, cond], i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-1">
              <span className="tabular-nums text-stone-400">{i + 1}.</span>
              <span className={`badge ${stageStyles[st as "a_traiter"] ?? "bg-stone-100"}`}>{t.stages[st as "a_traiter"] ?? st}</span>
              <span className="text-stone-700">{cond}</span>
            </li>
          ))}
        </ol>
      ) : "—") },
    { key: "reminder", label: r.reminderRule, text: (x) => x.reminder, keepCase: true, width: "18%", className: "text-stone-700" },
  ];
  return (
    <section>
      <h2 className="font-semibold">{r.followTitle}</h2>
      <p className="text-xs font-medium text-brand-700">{t.devFields.autoUpdated}</p>
      <p className="mb-2 max-w-3xl text-xs text-stone-500">{r.followIntro}</p>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.id} dense fixed mergedHeader />
    </section>
  );
}
