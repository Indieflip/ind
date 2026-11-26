"use client";

import { MODES, RESOLUTIONS, STAGES, WEIGH_TYPE, modeIcon, stageStyles } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { DataTable, type Col } from "@/components/table/DataTable";
import { NUM_FORMAT, fmtNo, type NumKind } from "@/lib/numbering";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCharacteristicPointAction } from "@/lib/actions/dev";

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
            {(Object.keys(t.anomalies.types) as (keyof typeof t.anomalies.types)[]).filter((k) => k !== "quantity").map((k) => (
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
export function FollowUpCharacteristics({ points }: { points: Record<string, string> }) {
  const { t } = useI18n();
  const r = t.rules;
  const rows: CharRow[] = [
    ...MODES.map((m) => ({ id: `mode-${m}`, characteristic: r.charMode, post: t.modes[m], detail: `${t.sheet.modeHints[m]}. ${r.modeSavings[m]}`, steps: r.followSteps[m] as unknown as [string, string][], reminder: r.modeReminder[m] })),
    ...STAGES.map((st) => ({ id: `stage-${st}`, characteristic: r.charStage, post: t.stages[st], detail: r.stageText[st], steps: [] as [string, string][], reminder: r.stageReminder[st] })),
    // Types d'anomalie : quand la fiche est créée automatiquement, et le rappel qui s'applique
    ...(Object.keys(t.anomalies.types) as (keyof typeof t.anomalies.types)[]).filter((k) => k !== "quantity").map((k) => ({ id: `type-${k}`, characteristic: r.charType, post: t.anomalies.types[k], detail: `${r.createdWhen} ${(r.typeText as Record<string, string>)[k] ?? "—"}`, steps: [] as [string, string][], reminder: (r.typeReminder as Record<string, string>)[k] ?? r.typeReminderDefault })),
    { id: "type-weigh", characteristic: r.charType, post: WEIGH_TYPE, detail: `${r.createdWhen} ${r.weighTypeText}`, steps: [], reminder: r.typeReminderDefault },
    // Numéro incrémentation : format de chaque fiche / compte (tiré de src/lib/numbering.ts)
    ...(Object.keys(NUM_FORMAT) as NumKind[]).map((k) => ({
      id: `num-${k}`, characteristic: r.charNumber, post: r.numPosts[k],
      detail: `${fmtNo(k, 1)}, ${fmtNo(k, 2)}… ${r.numDetail.replace("{n}", NUM_FORMAT[k].digits === 4 ? "9999" : "999").replace("{next}", fmtNo(k, NUM_FORMAT[k].digits === 4 ? 10000 : 1000))}`,
      steps: [] as [string, string][], reminder: NUM_FORMAT[k].yearly ? r.numYearly : r.numPermanent,
    })),
  ];
  const cols: Col<CharRow>[] = [
    { key: "point", label: r.point, text: (x) => points[x.id] ?? "", keepCase: true, width: "16%", render: (x) => <PointCell id={x.id} value={points[x.id] ?? ""} placeholder={r.pointPlaceholder} /> },
    { key: "characteristic", label: r.characteristic, text: (x) => x.characteristic, keepCase: true, width: "12%", className: "font-medium" },
    { key: "post", label: r.post, text: (x) => x.post, keepCase: true, width: "16%", className: "font-medium",
      render: (x) => (x.id.startsWith("stage-") ? <span className={`badge ${stageStyles[x.id.slice(6) as "a_traiter"]}`}>{x.post}</span> : x.post) },
    { key: "detail", label: r.detail, text: (x) => x.detail, keepCase: true, width: "24%", className: "text-stone-700" },
    { key: "reminder", label: r.reminderRule, text: (x) => x.reminder, keepCase: true, className: "text-stone-700" },
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

/** Colonne « Origine » : texte libre, enregistré en quittant le champ */
function PointCell({ id, value, placeholder }: { id: string; value: string; placeholder: string }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [, start] = useTransition();
  return (
    <textarea
      className="input min-h-[2.25rem] w-full py-1 text-xs"
      rows={2}
      value={v}
      placeholder={placeholder}
      aria-label={id}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && start(async () => { await saveCharacteristicPointAction(id, v); router.refresh(); })}
    />
  );
}
