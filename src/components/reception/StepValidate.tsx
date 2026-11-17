"use client";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { Catalog, Draft } from "@/lib/reception-types";
import { decisionStyles } from "../DecisionBadge";
import { docNumbers, docsOf, lineDoc, needsDlc, needsTemp, priceGap } from "./helpers";

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
  const missingDlc = draft.lines.filter((l) => needsDlc(l, catalog));
  const undecided = draft.lines.filter((l) => !l.decision);

  const w = t.wizard;
  const multiDoc = docNumbers(draft).length > 1;
  const dash = (v: string | null | undefined) => (v && String(v).trim() ? v : "—");
  return (
    <>
      <section className="card p-4">
        <h2 className="font-semibold">{w.recap}</h2>
        <p className="mb-3 text-xs text-stone-500">{w.recapHint}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-stone-500">{t.common.supplier}</dt><dd className="font-semibold">{dash(draft.supplierName)}</dd></div>
          <div><dt className="text-stone-500">{w.dateTime}</dt><dd className="font-medium">{fmtDateTime(draft.deliveredAt)}</dd></div>
          <div className="col-span-2"><dt className="text-stone-500">{w.docType}</dt><dd className="font-medium">{docsOf(draft).filter((x) => x.number.trim()).map((x) => `${w.docTypes[x.type]} ${x.number}${x.date ? ` du ${fmtDate(x.date)}` : ""}`).join(" · ") || "—"}</dd></div>
          <div><dt className="text-stone-500">{w.driverName}</dt><dd className="font-medium">{dash(draft.driverName)}</dd></div>
          <div><dt className="text-stone-500">{t.receptions.truckTemp}</dt><dd className="font-medium">{draft.truckTemp ? `${draft.truckTemp} °C` : "—"}</dd></div>
          <div><dt className="text-stone-500">{t.receptions.vehicleClean}</dt><dd className="font-medium">{draft.vehicleClean == null ? "—" : draft.vehicleClean ? t.common.yes : t.common.no}</dd></div>
          <div className="col-span-2"><dt className="text-stone-500">{t.receptions.blPhotos}</dt><dd className="font-medium">{draft.blPhotos.length || (draft.noBl ? t.receptions.noBl : "—")}</dd></div>
        </dl>
        {draft.bakery && (
          <p className="mt-2 text-sm text-stone-700">
            {t.wizard.bakery} : {(["baguette", "hamburger", "rolls", "painDeMie"] as const).filter((k) => draft.bakery?.[k]).map((k) => `${t.bakery[k]} ${draft.bakery![k]}`).join(" · ") || "—"}
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          {draft.lines.length === 0 ? (
            <p className="text-sm text-stone-500">{w.noLines}</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-stone-500">
                <tr>{multiDoc && <th className="py-1 pr-2">{t.receptions.blInvoice}</th>}<th className="py-1 pr-2">{t.common.product}</th><th className="px-1 text-right">{w.received}</th><th className="px-1 text-right">°C</th><th className="px-1">DLC</th><th className="px-1 text-right">{t.common.price}</th><th className="pl-1">{t.common.status}</th></tr>
              </thead>
              <tbody>
                {(multiDoc ? docNumbers(draft).flatMap((n) => draft.lines.filter((l) => lineDoc(draft, l) === n)) : draft.lines).map((l) => (
                  <tr key={l.key} className="border-t border-stone-100">
                    {multiDoc && <td className="py-1.5 pr-2 whitespace-nowrap text-stone-600">{lineDoc(draft, l)}</td>}
                    <td className="py-1.5 pr-2 font-medium">{l.productName}</td>
                    <td className="px-1 text-right tabular-nums">{dash(l.qtyReceived)}{l.qtyOrdered && l.qtyOrdered !== l.qtyReceived ? ` / ${l.qtyOrdered}` : ""} {l.unit}</td>
                    <td className="px-1 text-right tabular-nums">{dash(l.temperature)}</td>
                    <td className="px-1 whitespace-nowrap">{l.dlc ? fmtDate(l.dlc) : "—"}</td>
                    <td className="px-1 text-right tabular-nums">{dash(l.unitPrice)}</td>
                    <td className="pl-1">{l.decision ? <span className={`badge ${decisionStyles[l.decision].badge}`}>{t.decision[l.decision]}</span> : <span className="badge bg-amber-100 text-amber-900">{w.toDecide}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">{t.wizard.summary}</h2>
        <div className="grid grid-cols-2 gap-2 text-center">
          {(count("reserve") ? (["conform", "reserve", "refuse"] as const) : (["conform", "refuse"] as const)).map((d) => (
            <div key={d} className={`rounded-lg p-3 ${decisionStyles[d].badge}`}>
              <div className="text-2xl font-bold">{count(d)}</div>
              <div className="text-xs font-semibold">{t.decision[d]}</div>
            </div>
          ))}
        </div>
        {gaps > 0 && <p className="mt-3 text-sm text-stone-700"><strong>{gaps}</strong> {t.wizard.priceGaps}</p>}
      </section>

      {undecided.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{undecided.length}</strong> {w.undecided} :
          <ul className="mt-1 list-inside list-disc">{undecided.map((l) => <li key={l.key}>{l.productName}</li>)}</ul>
          <button type="button" className="btn-secondary mt-2" onClick={() => setDraft((d) => ({ ...d, step: 2 }))}>{t.common.back}</button>
        </section>
      )}

      {missingDlc.length > 0 && (
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <strong>{missingDlc.length}</strong> {w.missingDlc} :
          <ul className="mt-1 list-inside list-disc">{missingDlc.map((l) => <li key={l.key}>{l.productName}</li>)}</ul>
          <button type="button" className="btn-secondary mt-2" onClick={() => setDraft((d) => ({ ...d, step: 2 }))}>{t.common.back}</button>
        </section>
      )}

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

      <section className="card flex items-center justify-between gap-2 p-4 text-sm">
        <span>{draft.signature ? <>✓ {w.signedBy} {draft.signerName || draft.driverName || "—"}</> : draft.driverLeft ? <>⚠ {w.driverLeft}</> : <span className="text-red-700">{w.signRequired}</span>}</span>
        <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setDraft((d) => ({ ...d, step: 0 }))}>{t.common.edit}</button>
      </section>
    </>
  );
}
