"use client";
import { appConfirm } from "@/components/Confirm";
import { useI18n } from "@/lib/i18n/client";
import type { Draft } from "@/lib/reception-types";
import { Icon } from "../Icon";
import { PhotoButton, Thumbs } from "./PhotoButton";
import { SignaturePad } from "./SignaturePad";

/** Étape 1 : photos (BL / facture, étiquette lot / DLC) et signature du livreur (ou « parti sans signer ») */
export function StepPhoto({
  draft,
  setDraft,
  onConfirm,
  onNoBl,
  readingEnabled,
  receiverMustType = false,
  receiverRequired = true,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  onConfirm: () => void;
  onNoBl: () => void;
  readingEnabled: boolean;
  receiverMustType?: boolean;
  /** Signature du réceptionnaire : demandée seulement pour un profil invité */
  receiverRequired?: boolean;
}) {
  const { t } = useI18n();
  const w = t.wizard;
  const has = draft.blPhotos.length > 0;
  return (
    <>
      <section className="card space-y-4 p-4">
        <h2 className="font-semibold">1. {w.photoBlTitle}</h2>
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /> {w.anomalyFirst}</p>
        <p className="text-sm text-stone-600">{w.photoHint}</p>
        <Thumbs
          photos={draft.blPhotos}
          onRemove={async (i) => {
            if (!await appConfirm(w.removePhotoConfirm)) return;
            setDraft((d) => ({ ...d, blPhotos: d.blPhotos.filter((_, j) => j !== i), photoOk: false, blRead: "idle" }));
          }}
        />
        <PhotoButton
          multiple
          className={has ? "btn-secondary w-full" : "btn-primary btn-lg w-full"}
          label={has ? w.addPage : w.takePhoto}
          onPhotos={(urls) => setDraft((d) => ({ ...d, blPhotos: [...d.blPhotos, ...urls], photoOk: false, noBl: false, blRead: "idle" }))}
        />
      </section>

      {has && !draft.photoOk && (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-amber-900"><Icon name="camera" className="h-5 w-5" /> {w.photoCheckTitle}</h2>
          <p className="mt-1 text-sm text-amber-900">{w.photoCheckText}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn-primary btn-lg" onClick={onConfirm}>
              <Icon name="check" /> {w.photoCheckYes}
            </button>
            <button
              type="button"
              className="btn-secondary btn-lg"
              onClick={async () => {
                if (await appConfirm(w.retakeConfirm)) setDraft((d) => ({ ...d, blPhotos: [], photoOk: false, blRead: "idle" }));
              }}
            >
              {w.photoCheckNo}
            </button>
          </div>
          {readingEnabled && <p className="mt-2 text-xs text-amber-900">{w.autoReadHint}</p>}
        </section>
      )}

      {draft.photoOk && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><Icon name="check" className="h-4 w-4" /> {w.photoConfirmed}</p>
      )}

      {!has && !draft.noBl && (
        <button type="button" className="btn-ghost w-full" onClick={onNoBl}>
          {w.skipNoBl}
        </button>
      )}
      {draft.noBl && <p className="flex items-center gap-2 rounded-lg bg-stone-100 p-3 text-sm text-stone-700"><Icon name="check" className="h-4 w-4" /> {w.skipNoBl}</p>}

      <section id="label-photos" className="card space-y-3 p-4">
        <h2 className="font-semibold">2. {w.photoLabelTitle} <span className="text-xs font-normal text-stone-500">({w.labelRequiredFor})</span></h2>
        <p className="text-sm text-stone-600">{w.photoLabelHint}</p>
        <Thumbs
          photos={draft.labelPhotos ?? []}
          onRemove={async (i) => {
            if (!await appConfirm(w.removePhotoConfirm)) return;
            setDraft((d) => ({ ...d, labelPhotos: (d.labelPhotos ?? []).filter((_, j) => j !== i) }));
          }}
        />
        <PhotoButton multiple className="btn-secondary w-full" label={w.takeLabelPhoto} onPhotos={(urls) => setDraft((d) => ({ ...d, labelPhotos: [...(d.labelPhotos ?? []), ...urls] }))} />
      </section>

      <section id="signature" className={`card space-y-3 p-4 ${!draft.signature && !draft.driverLeft ? "ring-2 ring-amber-300" : ""}`}>
        <h2 className="font-semibold">3. {w.signTitle} <span className="text-red-600">*</span></h2>
        <div>
          <label className="label">{w.signerName} <span className="font-normal text-stone-400">({t.common.optional})</span></label>
          <input className="input" value={draft.signerName} onChange={(e) => setDraft((d) => ({ ...d, signerName: e.target.value }))} />
        </div>
        {!draft.driverLeft && (
          <div>
            <span className="label">{w.signHere}</span>
            <SignaturePad value={draft.signature} onChange={(sig) => setDraft((d) => ({ ...d, signature: sig, driverLeft: sig ? false : d.driverLeft }))} clearLabel={w.clearSignature} confirmText={w.clearSignatureConfirm} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!draft.driverLeft} disabled={!!draft.signature} onChange={(e) => setDraft((d) => ({ ...d, driverLeft: e.target.checked }))} />
          {w.driverLeft}
        </label>
      </section>

      {receiverRequired && <section id="receiver" className={`card space-y-3 p-4 ${!draft.receiverSignature ? "ring-2 ring-amber-300" : ""}`}>
        <h2 className="font-semibold">4. {w.receiverTitle} <span className="text-red-600">*</span></h2>
        <div>
          <label className="label">{w.receiverName} <span className="text-red-600">*</span></label>
          {receiverMustType ? (
            <input className={`input ${!draft.receiverName?.trim() ? "border-amber-400 bg-amber-50" : ""}`} value={draft.receiverName ?? ""} placeholder={w.receiverNamePh} onChange={(e) => setDraft((d) => ({ ...d, receiverName: e.target.value }))} />
          ) : (
            <p className="rounded-lg bg-stone-100 px-3 py-2 font-medium">{draft.receiverName || "—"}</p>
          )}
        </div>
        <div>
          <span className="label">{w.receiverSignHere}</span>
          <SignaturePad value={draft.receiverSignature ?? ""} onChange={(sig) => setDraft((d) => ({ ...d, receiverSignature: sig }))} clearLabel={w.clearSignature} confirmText={w.clearSignatureConfirm} />
        </div>
      </section>}
    </>
  );
}
