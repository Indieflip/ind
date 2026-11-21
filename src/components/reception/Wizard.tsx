"use client";
import { appConfirm } from "@/components/Confirm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, Draft, DraftLine } from "@/lib/reception-types";
import { clearDraft, enqueue, fetchCatalog, loadCatalogCache, loadDraft, saveDraft, saveServerDraft, sendReception } from "@/lib/client/offline";
import { Notice } from "@/components/Notice";
import { Icon } from "../Icon";
import { buildReservesText, docsOf, labelPhotoRequired, needsDlc, lineFromProduct, newDraft, toPayload, withAutoDecision } from "./helpers";
import { StepDelivery } from "./StepDelivery";
import { StepPhoto } from "./StepPhoto";
import { ReadingBanner } from "./ReadingBanner";
import { StepCheck } from "./StepCheck";
import { StepValidate } from "./StepValidate";

export function Wizard({ blReadingEnabled, editId, initialDraft, receiver }: { blReadingEnabled: boolean; editId?: number; initialDraft?: Draft; receiver?: { name: string; mustType: boolean } }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog>();
  const [draft, setDraftState] = useState<Draft>();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<null | { id?: number; offline?: boolean }>(null);
  const [error, setError] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [info, setInfo] = useState("");
  const [readCount, setReadCount] = useState(0);
  // Enregistrement en attente : une info manquait, l'utilisateur est allé la compléter
  const [retry, setRetry] = useState(false);
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
      const serverDraft = params.get("draft");
      if (serverDraft) {
        const res = await fetch(`/api/drafts/${serverDraft}`).catch(() => null);
        if (res?.ok && alive) {
          setDraftState({ ...newDraft(), ...((await res.json()).data as Draft) });
          return;
        }
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
        lines: d.lines.map((l) => (l.key === key ? withAutoDecision({ ...l, ...patch }, catalog, d.truckTemp) : l)),
      })),
    [setDraft, catalog],
  );

  // Signature du réceptionnaire : nom et prénom de l'utilisateur connecté (à saisir pour un invité ou un compte sans nom)
  const receiverDefault = receiver?.name ?? "";
  useEffect(() => {
    setDraftState((d) => (d && !d.receiverName && receiverDefault ? { ...d, receiverName: receiverDefault } : d));
  }, [receiverDefault, draft?.clientUuid]);

  // Conformité produit recalculée quand la T° du camion ou les seuils changent (choix manuels conservés)
  const truckTemp = draft?.truckTemp;
  useEffect(() => {
    if (!catalog) return;
    setDraftState((d) => {
      if (!d) return d;
      const lines = d.lines.map((l) => withAutoDecision(l, catalog, d.truckTemp));
      return lines.some((l, i) => l !== d.lines[i]) ? { ...d, lines } : d;
    });
  }, [truckTemp, catalog]);

  // Texte des réserves régénéré tant qu'il n'a pas été modifié à la main
  const autoReserves = useMemo(() => (draft ? buildReservesText(draft, t, catalog) : ""), [draft, t, catalog]);
  useEffect(() => {
    if (draft && !draft.reservesEdited && draft.reservesText !== autoReserves) {
      setDraft((d) => ({ ...d, reservesText: autoReserves }));
    }
  }, [autoReserves, draft, setDraft]);

  /** Lecture automatique du BL (lancée dès que la qualité de la photo est confirmée) */
  const readBl = useCallback(
    async (d: Draft) => {
      if (!d.blPhotos.length) return;
      if (!blReadingEnabled) {
        setDraft((x) => ({ ...x, blRead: "unavailable" }));
        return;
      }
      setDraft((x) => ({ ...x, blRead: "running" }));
      try {
        const res = await fetch("/api/bl/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ images: d.blPhotos, supplierId: d.supplierId }),
        });
        if (res.status === 503) return setDraft((x) => ({ ...x, blRead: "unavailable" }));
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          supplierId: number | null;
          supplierName: string | null;
          blNumber: string | null;
          lines: { productId: number | null; name: string; unit: string | null; quantity: number | null; unitPrice: number | null; lot: string | null; dlc: string | null }[];
        };
        setReadCount(data.lines.length);
        setDraft((x) => {
          const lines = data.lines.map((r) => {
            const product = catalog?.products.find((p) => p.id === r.productId) ?? null;
            return withAutoDecision(
              {
                ...lineFromProduct(product, { fromBl: true }),
                productName: product?.name ?? r.name,
                unit: product?.unit || r.unit || "Pièce",
                qtyOrdered: r.quantity != null ? String(r.quantity) : "",
                qtyReceived: r.quantity != null ? String(r.quantity) : "",
                unitPrice: r.unitPrice != null ? String(r.unitPrice) : "",
                lot: r.lot ?? "",
                dlc: r.dlc ?? "",
              },
              catalog,
              x.truckTemp,
            );
          });
          const chosen = !!x.supplierId || x.otherSupplier;
          const supplier = !chosen && data.supplierId ? catalog?.suppliers.find((s) => s.id === data.supplierId) : undefined;
          return {
            ...x,
            supplierId: supplier ? supplier.id : x.supplierId,
            supplierName: supplier ? supplier.name : x.supplierName,
            driverName: supplier && !x.driverName ? supplier.drivers[0] ?? "" : x.driverName,
            blNumber: x.blNumber || data.blNumber || "",
            documents: (() => {
              const docs = docsOf(x);
              return !docs[0]?.number && data.blNumber ? [{ ...docs[0], number: data.blNumber }, ...docs.slice(1)] : docs;
            })(),
            blRead: lines.length ? "done" : "none",
            lines: [...x.lines.filter((l) => !l.fromBl), ...lines],
          };
        });
      } catch {
        setDraft((x) => ({ ...x, blRead: "error" }));
      }
    },
    [blReadingEnabled, catalog, setDraft],
  );

  // Info manquante complétée (photo d'étiquette, signature, conformité) : la fiche s'enregistre directement,
  // sans repasser par toutes les étapes. Pour un champ tapé (prix, DLC), le bouton « Enregistrer la fiche » reste visible.
  const lastBlocking = useRef("");
  useEffect(() => {
    if (!retry || saving || !draft) return;
    const blocking = findProblem(draft);
    const key = blocking ? blocking.anchor : "";
    const prev = lastBlocking.current;
    lastBlocking.current = key;
    if (!blocking) {
      if (/^(signature|label-photos|line-)/.test(prev)) void finish();
    } else if (prev && key !== prev) setError(blocking.msg);
  });

  if (!draft) {
    return <div className="p-8 text-center text-stone-500">{t.common.loading}</div>;
  }

  async function saveAsDraft() {
    if (!draft) return;
    setDraftSaving(true);
    setError("");
    try {
      // On reste sur la page : le brouillon est aussi disponible dans Réceptions > Brouillons en cours
      const saved = await saveServerDraft(draft);
      void saved;
      setInfo(t.wizard.draftSavedHere);
      setTimeout(() => setInfo(""), 5000);
    } catch {
      setError(t.wizard.draftError);
    } finally {
      setDraftSaving(false);
    }
  }

  const go = (step: number) => {
    // Passage à l'étape 2 : brouillon enregistré automatiquement (sur le serveur, visible dans Réceptions)
    if (draft && !editId && draft.step === 0 && step === 1) {
      void saveServerDraft({ ...draft, step: 1 })
        .then(() => { setInfo(t.wizard.draftAuto); setTimeout(() => setInfo(""), 3000); })
        .catch(() => { /* hors ligne : le brouillon reste sur le téléphone */ });
    }
    setDraft((d) => ({ ...d, step }));
    topRef.current?.scrollIntoView();
    window.scrollTo({ top: 0 });
  };

  const supplierOk = (draft.otherSupplier ? draft.supplierName.trim().length > 0 : !!draft.supplierId) && !!draft.deliveredAt;
  const signed = !!draft.signature || !!draft.driverLeft || !!editId; // anciens bons modifiés : pas de blocage
  const canContinue = draft.step === 0 ? !!(draft.photoOk || draft.noBl) && signed : draft.step === 1 ? supplierOk : true;

  /**
   * Premier point bloquant avant d'enregistrer (étape et endroit où le corriger).
   * « auto » : une fois corrigé (photo, signature, choix), la fiche s'enregistre toute seule ;
   * pour un champ tapé (prix, DLC), le bouton « Enregistrer la fiche » reste à portée sur l'étape en cours.
   */
  const receiverRequired = !!receiver?.mustType; // signature du réceptionnaire : profil invité seulement
  function findProblem(d: Draft): null | { msg: string; step: number; anchor: string; auto: boolean } {
    if (!editId && !d.signature && !d.driverLeft) return { msg: t.wizard.signRequired, step: 0, anchor: "signature", auto: true };
    if (!editId && receiverRequired && (!d.receiverName?.trim() || !d.receiverSignature)) return { msg: t.wizard.receiverRequired, step: 0, anchor: "receiver", auto: false };
    const undecided = d.lines.filter((l) => !l.decision);
    if (undecided.length) return { msg: `${undecided.length} ${t.wizard.undecided}`, step: 2, anchor: `line-${undecided[0].key}`, auto: true };
    const noPrice = d.lines.filter((l) => l.productName.trim() && !l.unitPrice.trim() && !l.priceNotShown);
    if (noPrice.length) return { msg: `${noPrice.length} ${t.wizard.missingPrice}`, step: 2, anchor: `line-${noPrice[0].key}`, auto: false };
    const noDlc = d.lines.filter((l) => needsDlc(l, catalog));
    if (noDlc.length) return { msg: `${noDlc.length} ${t.wizard.missingDlc}`, step: 2, anchor: `line-${noDlc[0].key}`, auto: false };
    // Photo d'étiquette obligatoire pour les produits à DLC (nouvelles réceptions)
    if (!editId && !(d.labelPhotos ?? []).length && labelPhotoRequired(d.lines, catalog)) return { msg: t.wizard.missingLabelPhoto, step: 0, anchor: "label-photos", auto: true };
    return null;
  }

  async function finish() {
    if (!draft) return;
    const problem = findProblem(draft);
    if (problem) {
      // On amène l'utilisateur au bon endroit ; une fois complété, pas besoin de refaire toutes les étapes
      setError(problem.msg);
      setRetry(true);
      if (draft.step !== problem.step) go(problem.step);
      setTimeout(() => document.getElementById(problem.anchor)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      return;
    }
    setRetry(false);
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
      if ((e as Error).message === "duplicate_doc") {
        setError(t.wizard.docDuplicateSave);
        go(1);
      } else if (editId || (e as { fatal?: boolean }).fatal) {
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
          <Link href="/receptions" className="btn-secondary btn-lg">
            <Icon name="truck" /> {t.nav.receptions}
          </Link>
          <button className="btn-primary btn-lg" onClick={() => { setDone(null); setDraftState(newDraft()); router.replace("/receptions/new?new=1"); }}>
            {t.receptions.new}
          </button>
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
      {draft.step === 0 && !editId && (
        <Notice id="wizard-tips" version="1" closeLabel={t.common.close} className="border-sky-200 bg-sky-50 text-sky-900">
          <span><strong>{t.wizard.tipPauseTitle}</strong> {t.wizard.tipPause}</span>
          <span><strong>{t.wizard.tipOfflineTitle}</strong> {t.wizard.tipOffline}</span>
        </Notice>
      )}

      <div className="space-y-4 p-4 pb-32">
        {draft.step === 0 && (
          <StepPhoto
            draft={draft}
            setDraft={setDraft}
            readingEnabled={blReadingEnabled}
            receiverMustType={!!receiver?.mustType}
            receiverRequired={receiverRequired}
            onConfirm={() => {
              const d = { ...draft, photoOk: true, noBl: false };
              setDraft(() => d);
              void readBl(d);
              // Signature (ou « parti sans signer ») obligatoire avant l'étape 2
              if (signed) go(1);
              else setTimeout(() => document.getElementById("signature")?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
            }}
            onNoBl={() => {
              setDraft((d) => ({ ...d, noBl: true, photoOk: false, blRead: "idle" }));
              if (signed) go(1);
              else setTimeout(() => document.getElementById("signature")?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
            }}
          />
        )}
        {draft.step > 0 && draft.step < 3 && <ReadingBanner draft={draft} count={readCount || draft.lines.filter((l) => l.fromBl).length} onRetry={() => readBl(draft)} />}
        {draft.step === 1 && <StepDelivery draft={draft} setDraft={setDraft} catalog={catalog} editId={editId} />}
        {draft.step === 2 && <StepCheck draft={draft} setDraft={setDraft} updateLine={updateLine} catalog={catalog} />}
        {draft.step === 3 && <StepValidate draft={draft} setDraft={setDraft} catalog={catalog} autoReserves={autoReserves} editing={!!editId} />}
        {(info || error) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 mx-auto max-w-2xl px-3">
            {info && <p className="pointer-events-auto rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 shadow-lg">{info}</p>}
            {error && (
              <p className="pointer-events-auto flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 shadow-lg">
                {error}
                <button type="button" className="text-red-400" aria-label={t.common.close} onClick={() => setError("")}>✕</button>
              </p>
            )}
          </div>
        )}
        {draft.step === 0 && !editId && (
          <button
            type="button"
            className="btn-ghost w-full text-red-600"
            onClick={async () => {
              if (!await appConfirm(t.wizard.discardConfirm)) return;
              await clearDraft();
              router.push("/receptions");
            }}
          >
            {t.wizard.discard}
          </button>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-2xl gap-2 p-3 [&>button]:min-w-0 [&>button]:px-2 sm:gap-3 sm:[&>button]:px-4">
          {draft.step > 0 && (
            <button type="button" className="btn-secondary btn-lg flex-1" onClick={() => go(draft.step - 1)}>
              <Icon name="chevronLeft" /> <span className="truncate">{t.common.back}</span>
            </button>
          )}
          {editId && draft.step < 3 && (
            <button type="button" className="btn-secondary btn-lg flex-1" disabled={saving || !canContinue} onClick={finish}>
              <Icon name="check" /> {saving ? t.wizard.saving : t.common.save}
            </button>
          )}
          {!editId && draft.step >= 1 && (
            <button type="button" className="btn-secondary btn-lg flex-1" disabled={draftSaving || saving} onClick={saveAsDraft} title={t.wizard.saveDraftHint}>
              <Icon name="file" className="hidden h-5 w-5 shrink-0 sm:block" /> <span className="text-xs leading-tight sm:text-sm">{draftSaving ? t.wizard.saving : t.wizard.saveDraft}</span>
            </button>
          )}
          {retry && draft.step < 3 && !editId ? (
            <button type="button" className="btn-primary btn-lg flex-[1.4]" disabled={saving} onClick={finish}>
              <Icon name="check" /> <span className="truncate text-sm sm:text-base">{saving ? t.wizard.saving : t.wizard.saveNow}</span>
            </button>
          ) : draft.step < 3 ? (
            <button type="button" className="btn-primary btn-lg flex-[1.4]" disabled={!canContinue} onClick={() => go(draft.step + 1)}>
              <span className="truncate">{t.common.continue}</span> <Icon name="chevronRight" />
            </button>
          ) : (
            <button type="button" className="btn-primary btn-lg flex-[1.4]" disabled={saving} onClick={finish}>
              <Icon name="check" /> <span className="truncate text-sm sm:text-base">{saving ? t.wizard.saving : editId ? t.receptions.saveChanges : t.wizard.finish}</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
