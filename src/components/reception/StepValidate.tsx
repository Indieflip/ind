"use client";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, Draft } from "@/lib/reception-types";
import { decisionStyles } from "../DecisionBadge";
import { needsTemp, priceGap } from "./helpers";
import { SignaturePad } from "./SignaturePad";

export function StepValidate({
  draft,
  setDraft,
  catalog,
  autoReserves,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  catalog?: Catalog;
  autoReserves: string;
}) {
  const { t } = useI18n();
  const count = (d: "conform" | "reserve" | "refuse") => draft.lines.filter((l) => l.decision === d).length;
  const gaps = draft.lines.filter((l) => {
    const g = priceGap(l);
    return g != null && g !== 0;
  }).length;
  const missingTemps = draft.lines.filter((l) => needsTemp(l, catalog));

  return (
    <>
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">{t.wizard.summary}</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {(["conform", "reserve", "refuse"] as const).map((d) => (
            <div key={d} className={`rounded-lg p-3 ${decisionStyles[d].badge}`}>
              <div className="text-2xl font-bold">{count(d)}</div>
              <div className="text-xs font-semibold">{t.decision[d]}</div>
            </div>
          ))}
        </div>
        {gaps > 0 && <p className="mt-3 text-sm text-stone-700"><strong>{gaps}</strong> {t.wizard.priceGaps}</p>}
      </section>

      {missingTemps.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{missingTemps.length}</strong> {t.wizard.missingTemps} :
          <ul className="mt-1 list-inside list-disc">
            {missingTemps.map((l) => <li key={l.key}>{l.productName}</li>)}
          </ul>
          <button type="button" className="btn-secondary mt-2" onClick={() => setDraft((d) => ({ ...d, step: 2 }))}>
            {t.common.back}
          </button>
        </section>
      )}

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">{t.wizard.reservesToCopy}</h2>
        <p className="text-xs text-stone-500">{t.wizard.reservesHint}</p>
        <textarea
          className="input min-h-28 font-mono text-sm"
          value={draft.reservesText}
          placeholder={t.wizard.noReserves}
          onChange={(e) => setDraft((d) => ({ ...d, reservesText: e.target.value, reservesEdited: true }))}
        />
        {draft.reservesEdited && draft.reservesText !== autoReserves && (
          <button type="button" className="text-xs text-stone-500 underline" onClick={() => setDraft((d) => ({ ...d, reservesEdited: false }))}>
            {t.common.reset}
          </button>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <label className="label">
            {t.wizard.signerName} <span className="font-normal text-stone-400">({t.common.optional})</span>
          </label>
          <input className="input" value={draft.signerName || draft.driverName} onChange={(e) => setDraft((d) => ({ ...d, signerName: e.target.value }))} />
        </div>
        <div>
          <span className="label">{t.wizard.signHere}</span>
          <SignaturePad value={draft.signature} onChange={(sig) => setDraft((d) => ({ ...d, signature: sig, signerName: d.signerName || d.driverName }))} clearLabel={t.wizard.clearSignature} />
        </div>
      </section>
    </>
  );
}
