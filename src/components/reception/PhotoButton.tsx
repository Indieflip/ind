"use client";
import { useRef, useState } from "react";
import { compressImage } from "@/lib/client/image";
import { Icon } from "../Icon";

export function PhotoButton({
  onPhotos,
  label,
  className = "btn-secondary",
  multiple = false,
}: {
  onPhotos: (dataUrls: string[]) => void;
  label: string;
  className?: string;
  multiple?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => ref.current?.click()}>
        <Icon name="camera" /> {busy ? "…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          try {
            const out: string[] = [];
            for (const f of files) out.push(await compressImage(f));
            onPhotos(out);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

export function Thumbs({ photos, onRemove }: { photos: string[]; onRemove?: (i: number) => void }) {
  if (!photos.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={i} className="relative">
          <img src={p} alt="" className="h-20 w-20 rounded-lg border border-stone-200 object-cover" />
          {onRemove && (
            <button type="button" onClick={() => onRemove(i)} className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white" aria-label="×">
              <Icon name="x" className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
