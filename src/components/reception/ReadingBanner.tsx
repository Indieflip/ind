"use client";
import { useI18n } from "@/lib/i18n/client";
import type { Draft } from "@/lib/reception-types";

/** État de la lecture automatique du BL, affiché aux étapes suivantes */
export function ReadingBanner({ draft, count, onRetry }: { draft: Draft; count: number; onRetry: () => void }) {
  const { t } = useI18n();
  const w = t.wizard;
  const box = "rounded-lg p-3 text-sm";
  switch (draft.blRead) {
    case "running":
      return <p className={`${box} animate-pulse bg-sky-50 text-sky-800`}>{w.reading}</p>;
    case "done":
      return <p className={`${box} bg-emerald-50 text-emerald-800`}><strong>{count}</strong> {w.readDone}</p>;
    case "none":
      return <p className={`${box} bg-amber-50 text-amber-900`}>{w.readNone}</p>;
    case "unavailable":
      return <p className={`${box} bg-stone-100 text-stone-600`}>{w.readUnavailable}</p>;
    case "error":
      return (
        <p className={`${box} bg-red-50 text-red-700`}>
          {t.common.error}. {w.readNone}{" "}
          <button type="button" className="underline" onClick={onRetry}>{w.retry}</button>
        </p>
      );
    default:
      return null;
  }
}
