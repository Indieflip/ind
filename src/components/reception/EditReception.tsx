"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { num } from "@/lib/format";
import type { Catalog, Draft, DraftLine } from "@/lib/reception-types";
import { fetchCatalog, loadCatalogCache, sendReception } from "@/lib/client/offline";
import { Icon } from "../Icon";
import { buildReservesText, needsDlc, toPayload, withAutoDecision } from "./helpers";
import { StepDelivery } from "./StepDelivery";
import { StepCheck } from "./StepCheck";

/**
 * Modifier une fiche de réception (non consolidée) : tout sur une seule page, sans étapes
 * — Livraison, Produits, Réserves — et une barre « Enregistrer » toujours visible en bas (téléphone compris).
 */
export function EditReception({ id, initialDraft, number }: { id: number; initialDraft: Draft; number: string }) {
  const { t } = useI18n();
  const E = t.editReception;
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog>();
  const [draft, setDraftState] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ delivery: false, products: true, reserves: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await loadCatalogCache();
      if (cached && alive) setCatalog(cached);
      const fresh = await fetchCatalog();
      if (fresh && alive) setCatalog(fresh);
    })();
    return () => { alive = false; };
  }, []);

  const setDraft = useCallback((fn: (d: Draft) => Draft) => setDraftState((d) => fn(d)), []);
  const updateLine = useCallback(
    (key: string, patch: Partial<DraftLine>) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? (d.kind === "reprise" ? { ...l, ...patch, decision: "conform" as const } : withAutoDecision({ ...l, ...patch }, catalog, d.truckTemp)) : l)) })),
    [setDraft, catalog],
  );
  // Réserves : texte recalculé tant qu'il n'a pas été modifié à la main
  const autoReserves = useMemo(() => buildReservesText(draft, t, catalog), [draft, t, catalog]);
  useEffect(() => {
    if (!draft.reservesEdited && draft.reservesText !== autoReserves) setDraft((d) => ({ ...d, reservesText: autoReserves }));
  }, [autoReserves, draft.reservesEdited, draft.reservesText, setDraft]);

  const dirty = JSON.stringify({ ...draft, updatedAt: "" }) !== JSON.stringify({ ...initialDraft, updatedAt: "", reservesText: draft.reservesEdited ? initialDraft.reservesText : draft.reservesText });
  const goLine = (key: string) => {
    setOpen((o) => ({ ...o, products: true }));
    setTimeout(() => document.getElementById(`line-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };

  async function save() {
    setError("");
    if (!draft.deliveredAt || (!draft.supplierId && !draft.supplierName.trim())) {
      setOpen((o) => ({ ...o, delivery: true }));
      return setError(E.deliveryMissing);
    }
    // Fiche importée (générée depuis les anomalies importées) : aucun champ obligatoire ; sans décision = Conforme
    if (draft.kind === "reprise") {
      // Bon de reprise : motif du retour obligatoire
      const noQty = draft.lines.filter((l) => l.productName.trim() && !((num(l.qtyReceived) ?? num(l.qtyOrdered) ?? 0) > 0));
      if (noQty.length) { goLine(noQty[0].key); return setError(`${noQty.length} ${t.wizard.qtyRequired}`); }
      const noReason = draft.lines.filter((l) => l.productName.trim() && !l.reason);
      if (noReason.length) { goLine(noReason[0].key); return setError(`${noReason.length} ${t.wizard.reasonRequired}`); }
    }
    if (draft.imported || draft.kind === "reprise") return send({ ...draft, lines: draft.lines.map((l) => (l.decision ? l : { ...l, decision: "conform" as const })) });
    const undecided = draft.lines.find((l) => !l.decision);
    if (undecided) { goLine(undecided.key); return setError(`${draft.lines.filter((l) => !l.decision).length} ${t.wizard.undecided}`); }
    const noPrice = draft.lines.filter((l) => l.productName.trim() && !l.unitPrice.trim() && !l.priceNotShown);
    if (noPrice.length) { goLine(noPrice[0].key); return setError(`${noPrice.length} ${t.wizard.missingPrice}`); }
    const noDlc = draft.lines.filter((l) => needsDlc(l, catalog));
    if (noDlc.length) { goLine(noDlc[0].key); return setError(`${noDlc.length} ${t.wizard.missingDlc}`); }
    return send(draft);
  }

  async function send(d: Draft) {
    setSaving(true);
    try {
      await sendReception(toPayload(d), id);
      router.push(`/receptions/${id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message === "duplicate_doc" ? t.wizard.docDuplicateSave : `${E.saveFailed} (${(e as Error).message})`);
      setSaving(false);
    }
  }

  const section = (key: string, title: string, hint: string, body: React.ReactNode) => (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span><span className="block font-semibold">{title}</span><span className="block text-xs text-stone-500">{hint}</span></span>
        <span className={`text-stone-400 transition ${open[key] ? "rotate-90" : ""}`}>▸</span>
      </button>
      {open[key] && <div className="space-y-3 border-t border-stone-100 bg-stone-50/60 p-3 sm:p-4">{body}</div>}
    </section>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-3xl space-y-3 px-3 pb-28 pt-3 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/receptions/${id}`} className="btn-ghost -ml-2 px-2 py-1.5 text-sm"><Icon name="chevronLeft" className="h-4 w-4" /> {t.common.cancel}</Link>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">{E.title} · {number}</span>
      </div>
      {draft.kind === "reprise" && <p className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">↩ {t.returnSlip.detail}</p>}
      <h1 className="text-xl font-bold leading-tight">{draft.supplierName}</h1>
      {draft.imported && <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">{E.importedHint}</p>}

      {section("delivery", E.delivery, E.deliveryHint, <StepDelivery draft={draft} setDraft={setDraft} catalog={catalog} editId={id} />)}
      {section("products", `${E.products} (${draft.lines.length})`, E.productsHint, <StepCheck draft={draft} setDraft={setDraft} updateLine={updateLine} catalog={catalog} />)}
      {section("reserves", E.reserves, E.reservesHint, (
        <textarea
          className="input min-h-32 text-sm"
          value={draft.reservesText}
          onChange={(e) => setDraft((d) => ({ ...d, reservesText: e.target.value, reservesEdited: true }))}
        />
      ))}

      {/* Barre d'enregistrement : toujours visible en bas de l'écran */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-3 pt-2 backdrop-blur" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          {error ? <p className="w-full text-sm font-medium text-red-700">⚠ {error}</p> : dirty ? <p className="w-full text-xs text-amber-700">{E.unsaved}</p> : null}
          <button type="button" className="btn-primary btn-lg flex-1" disabled={saving} onClick={save}><Icon name="check" className="h-5 w-5" /> {saving ? E.saving : E.save}</button>
          <Link href={`/receptions/${id}`} className="btn-secondary btn-lg">{t.common.cancel}</Link>
        </div>
      </div>
    </div>
  );
}
