"use client";
import { useRef, useState } from "react";
import { compressImage } from "@/lib/client/image";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "../Icon";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf";

const readDataUrl = (f: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });

/** Prépare un fichier : photo compressée, PDF tel quel. Lève une erreur lisible sinon. */
export async function prepareFile(f: File, messages: { tooLarge: string; badType: string }): Promise<string> {
  const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  if (isPdf) {
    if (f.size > MAX_BYTES) throw new Error(messages.tooLarge);
    const url = await readDataUrl(f);
    return url.replace(/^data:[^;]*;/, "data:application/pdf;");
  }
  const isImage = f.type.startsWith("image/") || /\.(png|jpe?g|heic|heif|webp)$/i.test(f.name);
  if (!isImage) throw new Error(messages.badType);
  try {
    return await compressImage(f);
  } catch {
    // Format non lisible par le navigateur (ex. HEIC) : on garde le fichier s'il est en PNG/JPG
    if (/^image\/(png|jpeg)$/.test(f.type) && f.size <= MAX_BYTES) return readDataUrl(f);
    throw new Error(messages.badType);
  }
}

/**
 * Deux façons d'ajouter un document : prendre une photo (appareil photo du téléphone)
 * ou importer un fichier existant (PNG, JPG, PDF) depuis la galerie, les fichiers ou l'ordinateur.
 */
export function PhotoButton({
  onPhotos,
  label,
  importLabel,
  className = "btn-secondary",
  multiple = false,
  allowFiles = true,
}: {
  onPhotos: (dataUrls: string[]) => void;
  label: string;
  importLabel?: string;
  className?: string;
  multiple?: boolean;
  allowFiles?: boolean;
}) {
  const { t } = useI18n();
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handle = async (list: File[]) => {
    if (!list.length) return;
    setBusy(true);
    setError("");
    const out: string[] = [];
    const errors: string[] = [];
    for (const f of list) {
      try {
        out.push(await prepareFile(f, { tooLarge: t.wizard.fileTooLarge, badType: t.wizard.fileType }));
      } catch (e) {
        errors.push(`${f.name} : ${(e as Error).message}`);
      }
    }
    if (out.length) onPhotos(out);
    setError(errors.join("\n"));
    setBusy(false);
  };

  return (
    <div className="space-y-1">
      <div className={`grid gap-2 ${allowFiles ? "grid-cols-2" : ""}`}>
        <button type="button" className={className} disabled={busy} onClick={() => camera.current?.click()}>
          <Icon name="camera" /> {busy ? "…" : label}
        </button>
        {allowFiles && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => files.current?.click()}>
            <Icon name="file" /> {importLabel ?? t.wizard.importFile}
          </button>
        )}
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        className="hidden"
        onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; handle(l); }}
      />
      <input
        ref={files}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        className="hidden"
        data-testid="file-import"
        onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; handle(l); }}
      />
      {allowFiles && <p className="text-xs text-stone-500">{t.wizard.fileHint}</p>}
      {error && <p className="whitespace-pre-wrap text-xs text-red-600">{error}</p>}
    </div>
  );
}

const isPdf = (src: string) => src.startsWith("data:application/pdf") || /\.pdf($|\?)/i.test(src);

/** Miniatures cliquables : un clic ouvre la photo en grand pour vérifier sa qualité */
export function Thumbs({ photos, onRemove }: { photos: string[]; onRemove?: (i: number) => void }) {
  const { t } = useI18n();
  const [view, setView] = useState<number | null>(null);
  if (!photos.length) return null;
  const current = view != null ? photos[view] : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative">
            <button type="button" onClick={() => setView(i)} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" title={t.wizard.viewPhoto}>
              {isPdf(p) ? (
                <span className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-600">
                  <Icon name="file" className="h-6 w-6" />PDF
                </span>
              ) : (
                <img src={p} alt="" className="h-20 w-20 rounded-lg border border-stone-200 object-cover" />
              )}
            </button>
            {onRemove && (
              <button type="button" onClick={() => onRemove(i)} className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white" aria-label={t.common.delete}>
                <Icon name="x" className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {current && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black/90" role="dialog" aria-modal="true" onClick={() => setView(null)}>
          <div className="flex items-center justify-between p-3 text-white" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <span className="text-sm">{(view ?? 0) + 1} / {photos.length}</span>
            <button type="button" className="rounded-full bg-white/10 p-2" aria-label={t.common.close} onClick={() => setView(null)}><Icon name="x" className="h-5 w-5" /></button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2" onClick={(e) => e.stopPropagation()}>
            {isPdf(current) ? (
              <iframe src={current} className="h-full w-full rounded bg-white" title="PDF" />
            ) : (
              <img src={current} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>
          {photos.length > 1 && (
            <div className="flex justify-center gap-3 p-3" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn-secondary" disabled={view === 0} onClick={() => setView((v) => Math.max(0, (v ?? 0) - 1))}>‹</button>
              <button type="button" className="btn-secondary" disabled={view === photos.length - 1} onClick={() => setView((v) => Math.min(photos.length - 1, (v ?? 0) + 1))}>›</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
