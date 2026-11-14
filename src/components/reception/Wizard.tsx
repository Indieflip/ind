"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, Draft, DraftLine } from "@/lib/reception-types";
import { clearDraft, enqueue, fetchCatalog, loadCatalogCache, loadDraft, saveDraft, sendReception } from "@/lib/client/offline";
import { Icon } from "../Icon";
import { buildReservesText, newDraft, toPayload, withAutoDecision } from "./helpers";
import { StepDelivery } from "./StepDelivery";
import { StepBl } from "./StepBl";
import { StepCheck } from "./StepCheck";
import { StepValidate } from "./StepValidate";

export function Wizard({ blReadingEnabled, editId, initialDraft }: { blReadingEnabled: boolean; editId?: number; initialDraft?: Draft }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog>();
  const [draft, setDraftState] = useState<Draft>();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<null | { id?: number; offline?: boolean }>(null);
  const [error, setError] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  // Chargement : catalogue (cache puis réseau) + réception en cours
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await loadCatalogCache();
      if (cached && alive) setCatalog(cached);
      const fresh = await fetchCatalog();
      if (fresh && alive) setCatalog(fresh);
    })();
    (async () => {
      if (initialDraft) {
        if (alive) setDraftState(initialDraft);
        return;
      }
      const existing = params.get("new") ? undefined : await loadDraft();
      if (alive) setDraftState(existing ?? newDraft());
    })();
    return () => {
      alive = false;
    };
  }, [params, initialDraft]);

  // Sauvegarde automatique sur le téléphone à chaque saisie
  useEffect(() => {
    if (!draft || done || editId) return; // en modification, rien n'est gardé sur le téléphone
    const id = setTimeout(() => saveDraft(draft), 250);
    return () => clearTimeout(id);
  }, [draft, done, editId]);

  const setDraft = useCallback((fn: (d: Draft) => Draft) => setDraftState((d) => (d ? fn(d) : d)), []);

  const updateLine = useCallback(
    (key: string, patch: Partial<DraftLine>) =>
      setDraft((d) => ({
        ...d,
        lines: d.lines.map((l) => (l.key === key ? withAutoDecision({ ...l, ...patch }, catalog) : l)),
      })),
    [setDraft, catalog],
  );

  // Texte des réserves régénéré tant qu'il n'a pas été modifié à la main
  const autoReserves = useMemo(() => (draft ? buildReservesText(draft, t, catalog) : ""), [draft, t, catalog]);
  useEffect(() => {
    if (draft && !draft.reservesEdited && draft.reservesText !== autoReserves) {
      setDraft((d) => ({ ...d, reservesText: autoReserves }));
    }
  }, [autoReserves, draft, setDraft]);

  if (!draft) {
    return <div className="p-8 text-center text-stone-500">{t.common.loading}</div>;
  }

  const go = (step: number) => {
    setDraft((d) => ({ ...d, step }));
    topRef.current?.scrollIntoView();
    window.scrollTo({ top: 0 });
  };

  const canContinue =
    draft.step === 0 ? (draft.otherSupplier ? draft.supplierName.trim().length > 0 : !!draft.supplierId) && !!draft.deliveredAt : true;

  async function finish() {
    if (!draft) return;
    setSaving(true);
    setError("");
    const payload = toPayload(draft);
    try {
      const id = await sendReception(payload, editId);
      if (editId) {
        router.push(`/receptions/${editId}`);
        router.refresh();
        return;
      }
      await clearDraft();
      setDone({ id });
    } catch (e) {
      if (editId || (e as { fatal?: boolean }).fatal) {
        setError(`${t.common.error} : ${(e as Error).message}`);
      } else {
        await enqueue(payload);
        await clearDraft();
        setDone({ offline: true });
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <div className={`rounded-full p-4 ${done.offline ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
          <Icon name={done.offline ? "cloudOff" : "check"} className="h-10 w-10" />
        </div>
        <h1 className="text-xl font-bold">{done.offline ? t.common.offline : t.wizard.savedOk}</h1>
        {done.offline && <p className="text-stone-600">{t.wizard.savedOffline}</p>}
        <div className="flex w-full flex-col gap-2">
          {done.id && (
            <Link href={`/receptions/${done.id}`} className="btn-secondary btn-lg">
              {t.receptions.detail}
            </Link>
          )}
          <button className="btn-primary btn-lg" onClick={() => { setDone(null); setDraftState(newDraft()); router.replace("/receptions/new?new=1"); }}>
            {t.receptions.new}
          </button>
          <Link href="/receptions" className="btn-ghost">{t.nav.receptions}</Link>
        </div>
      </div>
    );
  }

  const steps = t.wizard.steps;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-stone-50" ref={topRef}>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-4 pb-3 backdrop-blur" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between gap-2">
          <Link href={editId ? `/receptions/${editId}` : "/receptions"} className="btn-ghost -ml-2 px-2 py-1.5 text-sm">
            <Icon name="chevronLeft" className="h-4 w-4" /> {editId ? t.common.cancel : t.nav.receptions}
          </Link>
          <span className="text-xs font-medium text-stone-500">
            {t.wizard.step} {draft.step + 1} {t.wizard.of} 4
          </span>
        </div>
        {editId && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{t.receptions.editing}</p>}
        <h1 className="mt-1 text-lg font-bold">
          {steps[draft.step]}
          {draft.step > 0 && draft.supplierName && <span className="font-normal text-stone-500"> · {draft.supplierName}</span>}
        </h1>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {steps.map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={i > draft.step && !canContinue}
              onClick={() => i <= draft.step && go(i)}
              className={`h-1.5 rounded-full ${i <= draft.step ? "bg-brand-500" : "bg-stone-200"}`}
              aria-label={s}
            />
          ))}
        </div>
      </header>

      <div className="space-y-4 p-4 pb-32">
        {draft.step === 0 && <StepDelivery draft={draft} setDraft={setDraft} catalog={catalog} />}
        {draft.step === 1 && (
          <StepBl draft={draft} setDraft={setDraft} catalog={catalog} enabled={blReadingEnabled} onNext={() => go(2)} />
        )}
        {draft.step === 2 && <StepCheck draft={draft} setDraft={setDraft} updateLine={updateLine} catalog={catalog} />}
        {draft.step === 3 && <StepValidate draft={draft} setDraft={setDraft} catalog={catalog} autoReserves={autoReserves} />}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {draft.step === 0 && !editId && (
          <button
            type="button"
            className="btn-ghost w-full text-red-600"
            onClick={async () => {
              if (!confirm(t.wizard.discardConfirm)) return;
              await clearDraft();
              router.push("/receptions");
            }}
          >
            {t.wizard.discard}
          </button>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-2xl gap-3 p-3">
          {draft.step > 0 && (
            <button type="button" className="btn-secondary btn-lg flex-1" onClick={() => go(draft.step - 1)}>
              <Icon name="chevronLeft" /> {t.common.back}
            </button>
          )}
          {editId && draft.step < 3 && (
            <button type="button" className="btn-secondary btn-lg flex-1" disabled={saving || !canContinue} onClick={finish}>
              <Icon name="check" /> {saving ? t.wizard.saving : t.common.save}
            </button>
          )}
          {draft.step < 3 ? (
            <button type="button" className="btn-primary btn-lg flex-[2]" disabled={!canContinue} onClick={() => go(draft.step + 1)}>
              {t.common.continue} <Icon name="chevronRight" />
            </button>
          ) : (
            <button type="button" className="btn-primary btn-lg flex-[2]" disabled={saving} onClick={finish}>
              <Icon name="check" /> {saving ? t.wizard.saving : editId ? t.receptions.saveChanges : t.wizard.finish}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
