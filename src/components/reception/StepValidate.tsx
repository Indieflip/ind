"use client";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate, fmtDateTime, fmtMoney, num } from "@/lib/format";
import { WEIGH_TYPE } from "@/lib/anomaly";
import type { Catalog, Draft } from "@/lib/reception-types";
import { decisionStyles } from "../DecisionBadge";
import { detectedType, docNumbers, docsOf, linesMissingLabel, lineDoc, needsDlc, needsTemp, priceGap } from "./helpers";

export function StepValidate({
  draft,
  setDraft,
  catalog,
  autoReserves,
  editing = false,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  catalog?: Catalog;
  autoReserves: string;
  editing?: boolean;
}) {
  const { t } = useI18n();
  const count = (d: "conform" | "reserve" | "refuse") => draft.lines.filter((l) => l.decision === d).length;
  const gaps = draft.lines.filter((l) => {
    const g = priceGap(l);
    return g != null && g !== 0;
  }).length;
  // Bon de reprise : ni T°, ni DLC, ni étiquette, ni conformité à contrôler
  const reprise = draft.kind === "reprise";
  const missingTemps = reprise ? [] : draft.lines.filter((l) => needsTemp(l, catalog));
  const missingDlc = reprise ? [] : draft.lines.filter((l) => needsDlc(l, catalog));
  // Photo d'étiquette : par produit dont la nature la demande (anciens brouillons : photo commune de l'étape 1)
  const missingLabel = reprise || editing || (draft.labelPhotos ?? []).length ? [] : linesMissingLabel(draft.lines, catalog);
  const undecided = reprise ? [] : draft.lines.filter((l) => !l.decision);

  const w = t.wizard;
  const multiDoc = docNumbers(draft).length > 1;
  const dash = (v: string | null | undefined) => (v && String(v).trim() ? v : "—");
  return (
    <>
      <RecapCard draft={draft} catalog={catalog} />

      {undecided.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{undecided.length}</strong> {w.undecided} :
          <ul className="mt-1 list-inside list-disc">{undecided.map((l) => <li key={l.key}>{l.productName}</li>)}</ul>
          <button type="button" className="btn-secondary mt-2" onClick={() => setDraft((d) => ({ ...d, step: 1 }))}>{t.common.back}</button>
        </section>
      )}

      {missingLabel.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{missingLabel.length}</strong> {w.labelMissingLines} :
          <ul className="mt-1 list-inside list-disc">{missingLabel.map((l) => <li key={l.key}>{l.productName}</li>)}</ul>
          <button type="button" className="btn-secondary mt-2 block" onClick={() => setDraft((d) => ({ ...d, step: 1 }))}>{w.goLabelPhoto}</button>
        </section>
      )}

      {missingDlc.length > 0 && (
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <strong>{missingDlc.length}</strong> {w.missingDlc} :
          <ul className="mt-1 list-inside list-disc">{missingDlc.map((l) => <li key={l.key}>{l.productName}</li>)}</ul>
          <button type="button" className="btn-secondary mt-2" onClick={() => setDraft((d) => ({ ...d, step: 1 }))}>{t.common.back}</button>
        </section>
      )}

      {missingTemps.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{missingTemps.length}</strong> {t.wizard.missingTemps} :
          <ul className="mt-1 list-inside list-disc">
            {missingTemps.map((l) => <li key={l.key}>{l.productName}</li>)}
          </ul>
          <button type="button" className="btn-secondary mt-2" onClick={() => setDraft((d) => ({ ...d, step: 1 }))}>
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

    </>
  );
}

/** Récap de la fiche (aussi l'aperçu de la fiche en modification) : en-tête, chiffres clés, produits ; onLine : clic sur un produit */
export function RecapCard({ draft, catalog, onLine, title }: { draft: Draft; catalog?: Catalog; onLine?: (key: string) => void; title?: string }) {
  const { t } = useI18n();
  const w = t.wizard;
  const reprise = draft.kind === "reprise";
  const count = (d: "conform" | "reserve" | "refuse") => draft.lines.filter((l) => l.decision === d).length;
  const gaps = draft.lines.filter((l) => { const g = priceGap(l); return g != null && g !== 0; }).length;
  const multiDoc = docNumbers(draft).length > 1;
  const dash = (v: string | null | undefined) => (v && String(v).trim() ? v : "—");
  // Récap : en-tête (fournisseur, date, documents), chiffres clés, puis produits en cartes
  const named = draft.lines.filter((l) => l.productName.trim());
  const price = (l: (typeof named)[number]) => num(l.unitPrice);
  const qty = (l: (typeof named)[number]) => num(l.qtyReceived) ?? num(l.qtyOrdered);
  const total = named.reduce((s, l) => s + (l.decision === "refuse" ? 0 : (qty(l) ?? 0) * (price(l) ?? 0)), 0);
  const flagged = reprise ? named.length : named.filter((l) => l.decision !== "conform" || l.refuseOn || l.returnOn || detectedType(l, catalog, t.anomalies.types, WEIGH_TYPE)).length + (draft.missingBl ? 1 : 0) + (draft.vehicleClean === false ? 1 : 0);
  const docsShown = docsOf(draft).filter((x) => x.number.trim());
  const ordered = multiDoc ? docNumbers(draft).flatMap((n) => draft.lines.filter((l) => lineDoc(draft, l) === n)) : draft.lines;
  const tile = (value: string | number, label: string, cls: string) => (
    <div className={`rounded-xl px-3 py-2 ${cls}`}><p className="text-xl font-bold leading-tight tabular-nums">{value}</p><p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p></div>
  );
  return (
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className={`px-4 py-4 text-white ${reprise ? "bg-gradient-to-r from-amber-600 to-amber-500" : "bg-gradient-to-r from-brand-700 to-brand-600"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/75">{title ?? (reprise ? `↩ ${t.returnSlip.detail}` : w.recap)}</p>
          <p className="mt-0.5 text-xl font-bold leading-tight">{dash(draft.supplierName)}</p>
          <p className="mt-0.5 text-sm text-white/85">{fmtDateTime(draft.deliveredAt)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {docsShown.length ? docsShown.map((x) => (
              <span key={x.number} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">{w.docTypes[x.type]} {x.number}{x.date ? ` · ${fmtDate(x.date)}` : ""}</span>
            )) : <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">{draft.missingBl ? w.missingBlBox : t.receptions.noBl}</span>}
            {draft.blPhotos.length > 0 && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">📎 {draft.blPhotos.length}</span>}
            {!reprise && draft.truckTemp && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">🌡 {draft.truckTemp} °C</span>}
            {!reprise && draft.vehicleClean != null && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${draft.vehicleClean ? "bg-white/20" : "bg-red-500"}`}>{t.receptions.vehicleClean} : {draft.vehicleClean ? t.common.yes : t.common.no}</span>}
          </div>
        </div>
        <div className={`grid gap-2 p-3 ${reprise ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
          {tile(named.length, t.returnSlip.products, "bg-stone-100 text-stone-800")}
          {tile(total ? fmtMoney(total) : "—", reprise ? t.returnSlip.totalTaken : t.receptions.total, "bg-stone-100 text-stone-800")}
          {!reprise && tile(count("refuse"), t.decision.refuse, decisionStyles.refuse.badge)}
          {!reprise && tile(flagged, w.anomalyTile, "bg-orange-100 text-orange-800")}
        </div>
        {draft.bakery && (
          <p className="px-4 pb-2 text-sm text-stone-700">
            {t.wizard.bakery} : {(["baguette", "hamburger", "rolls", "painDeMie"] as const).filter((k) => draft.bakery?.[k]).map((k) => `${t.bakery[k]} ${draft.bakery![k]}`).join(" · ") || "—"}
          </p>
        )}
        {named.length === 0 ? <p className="px-4 pb-4 text-sm text-stone-500">{w.noLines}</p> : (
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {ordered.filter((l) => l.productName.trim()).map((l) => {
              const type = !reprise && l.decision === "conform" && !l.refuseOn && !l.returnOn ? (l.typeManual && l.reason ? l.reason : detectedType(l, catalog, t.anomalies.types, WEIGH_TYPE)) : null;
              const reason = l.reason ? (t.reasons as Record<string, string>)[l.reason] ?? l.reason : "";
              return (
                <li key={l.key} onClick={onLine ? () => onLine(l.key) : undefined} className={`flex items-start justify-between gap-3 px-4 py-2.5 ${onLine ? "cursor-pointer hover:bg-stone-50" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.productName}</p>
                    <p className="text-xs text-stone-500">
                      {dash(reprise ? l.qtyReceived || l.qtyOrdered : l.qtyReceived)}{!reprise && l.qtyOrdered && l.qtyOrdered !== l.qtyReceived ? ` / ${l.qtyOrdered}` : ""} {l.unit}
                      {l.unitPrice ? ` · ${l.unitPrice} €` : l.priceNotShown ? ` · ${w.priceNotShown}` : ""}
                      {!reprise && l.temperature ? ` · ${l.temperature} °C` : ""}{!reprise && l.dlc ? ` · DLC ${fmtDate(l.dlc)}` : ""}
                      {multiDoc && ` · ${lineDoc(draft, l)}`}
                    </p>
                    {reprise && l.originRef && <p className="text-xs text-amber-800">↩ {l.originRef}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {reprise ? <span className={`badge ${reason ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>{reason || t.wizard.reasonMissingShort}</span>
                      : l.decision ? <span className={`badge ${decisionStyles[l.decision].badge}`}>{l.decision === "conform" ? w.accepted : t.decision[l.decision]}</span> : <span className="badge bg-amber-100 text-amber-900">{w.toDecide}</span>}
                    {(l.refuseOn || l.returnOn) && <span className="badge bg-red-50 text-red-700">{[l.refuseOn ? t.decision.refuse : "", l.returnOn ? w.returnBtn : ""].filter(Boolean).join(" · ")}{reason ? ` · ${reason}` : ""}</span>}
                    {type && <span className="badge bg-orange-100 text-orange-800">{type}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {gaps > 0 && <p className="border-t border-stone-100 px-4 py-2 text-sm text-stone-700"><strong>{gaps}</strong> {t.wizard.priceGaps}</p>}
      </section>
  );
}
