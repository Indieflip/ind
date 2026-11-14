"use client";
import { useI18n } from "@/lib/i18n/client";
import type { Draft } from "@/lib/reception-types";
import { Icon } from "../Icon";
import { PhotoButton, Thumbs } from "./PhotoButton";

/** Étape 1 : photo (ou fichier) du BL, puis confirmation de sa qualité */
export function StepPhoto({
  draft,
  setDraft,
  onConfirm,
  onNoBl,
  readingEnabled,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  onConfirm: () => void;
  onNoBl: () => void;
  readingEnabled: boolean;
}) {
  const { t } = useI18n();
  const w = t.wizard;
  const has = draft.blPhotos.length > 0;
  return (
    <>
      <section className="card space-y-4 p-4">
        <p className="text-sm text-stone-600">{w.photoHint}</p>
        <Thumbs
          photos={draft.blPhotos}
          onRemove={(i) => {
            if (!confirm(w.removePhotoConfirm)) return;
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
              onClick={() => {
                if (confirm(w.retakeConfirm)) setDraft((d) => ({ ...d, blPhotos: [], photoOk: false, blRead: "idle" }));
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

      {!has && (
        <button type="button" className="btn-ghost w-full" onClick={onNoBl}>
          {w.skipNoBl}
        </button>
      )}
    </>
  );
}
