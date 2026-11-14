"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, Draft } from "@/lib/reception-types";
import { Icon } from "../Icon";
import { PhotoButton, Thumbs } from "./PhotoButton";
import { lineFromProduct, withAutoDecision } from "./helpers";

interface ReadLine {
  productId: number | null;
  name: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lot: string | null;
  dlc: string | null;
}

export function StepBl({
  draft,
  setDraft,
  catalog,
  enabled,
  onNext,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  catalog?: Catalog;
  enabled: boolean;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const [reading, setReading] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  async function read() {
    setReading(true);
    setCount(null);
    try {
      const res = await fetch("/api/bl/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images: draft.blPhotos, supplierId: draft.supplierId }),
      });
      if (res.status === 503) {
        setDraft((d) => ({ ...d, blRead: "unavailable" }));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { lines: ReadLine[]; blNumber?: string | null };
      const lines = data.lines.map((r) => {
        const product = catalog?.products.find((p) => p.id === r.productId) ?? null;
        const base = lineFromProduct(product, { fromBl: true });
        return withAutoDecision(
          {
            ...base,
            productName: product?.name ?? r.name,
            unit: product?.unit ?? r.unit ?? base.unit,
            qtyOrdered: r.quantity != null ? String(r.quantity) : "",
            qtyReceived: r.quantity != null ? String(r.quantity) : "",
            unitPrice: r.unitPrice != null ? String(r.unitPrice) : "",
            lot: r.lot ?? "",
            dlc: r.dlc ?? "",
          },
          catalog,
        );
      });
      setCount(lines.length);
      setDraft((d) => ({
        ...d,
        blNumber: d.blNumber || data.blNumber || "",
        blRead: lines.length ? "done" : "none",
        // On garde les lignes déjà saisies à la main, on remplace celles venant d'une lecture précédente
        lines: [...d.lines.filter((l) => !l.fromBl), ...lines],
      }));
    } catch {
      setDraft((d) => ({ ...d, blRead: "error" }));
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <section className="card space-y-4 p-4">
        <p className="text-sm text-stone-600">{t.wizard.photoHint}</p>
        <Thumbs photos={draft.blPhotos} onRemove={(i) => setDraft((d) => ({ ...d, blPhotos: d.blPhotos.filter((_, j) => j !== i) }))} />
        <PhotoButton
          multiple
          className={draft.blPhotos.length ? "btn-secondary w-full" : "btn-primary btn-lg w-full"}
          label={draft.blPhotos.length ? t.wizard.addPage : t.wizard.takePhoto}
          onPhotos={(urls) => setDraft((d) => ({ ...d, blPhotos: [...d.blPhotos, ...urls], blRead: "idle" }))}
        />
      </section>

      {draft.blPhotos.length > 0 && (
        <section className="card space-y-3 p-4">
          <button type="button" className="btn-primary btn-lg w-full" disabled={reading} onClick={read}>
            <Icon name="sparkle" /> {reading ? t.wizard.reading : t.wizard.readBl}
          </button>
          {!enabled && draft.blRead === "idle" && <p className="text-xs text-stone-500">{t.wizard.readUnavailable}</p>}
          {draft.blRead === "done" && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <strong>{count ?? draft.lines.filter((l) => l.fromBl).length}</strong> {t.wizard.readDone}
              <button type="button" className="btn-primary mt-3 w-full" onClick={onNext}>
                {t.common.continue} <Icon name="chevronRight" />
              </button>
            </div>
          )}
          {draft.blRead === "none" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.wizard.readNone}</p>}
          {draft.blRead === "unavailable" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.wizard.readUnavailable}</p>}
          {draft.blRead === "error" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t.common.error}. {t.wizard.readNone}</p>}
          <p className="text-xs text-stone-500">{t.wizard.readWarning}</p>
        </section>
      )}

      <button type="button" className="btn-ghost w-full" onClick={onNext}>
        {t.wizard.skipNoBl}
      </button>
    </>
  );
}
