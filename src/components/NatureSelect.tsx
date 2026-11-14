"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/** Choix de une ou plusieurs natures (enregistrées « Epicerie, Surgelès ») */
export function NatureSelect({ value, options, onChange, name }: { value: string; options: string[]; onChange?: (v: string) => void; name?: string }) {
  const { t } = useI18n();
  const split = (v: string) => v.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  const [sel, setSel] = useState<string[]>(split(value));
  const [extra, setExtra] = useState("");
  const all = [...new Set([...options, ...sel])].sort((a, b) => a.localeCompare(b, "fr"));
  const update = (next: string[]) => {
    setSel(next);
    onChange?.(next.join(", "));
  };
  return (
    <div className="space-y-1">
      {name && <input type="hidden" name={name} value={sel.join(", ")} />}
      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded-lg border border-stone-300 bg-white p-1.5">
        {all.map((n) => {
          const on = sel.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => update(on ? sel.filter((x) => x !== n) : [...sel, n])}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${on ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1">
        <input className="input px-2 py-1 text-xs" value={extra} placeholder={t.mercurial.newNature} onChange={(e) => setExtra(e.target.value)} />
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          disabled={!extra.trim()}
          onClick={() => {
            const n = extra.trim().charAt(0).toUpperCase() + extra.trim().slice(1);
            if (!sel.includes(n)) update([...sel, n]);
            setExtra("");
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
