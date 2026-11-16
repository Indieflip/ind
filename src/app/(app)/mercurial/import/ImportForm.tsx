"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importExcelAction } from "@/lib/actions/excel";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

/** Import d'un fichier Excel : on dépose le fichier, on importe. Le type de fichier et ses onglets sont reconnus seuls. */
export function ImportForm() {
  const { t } = useI18n();
  const x = t.excelImport;
  const [state, action, pending] = useActionState(importExcelAction, undefined);
  const r = state?.report;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [showReport, setShowReport] = useState(true);
  useEffect(() => {
    if (state) { setFile(null); if (input.current) input.current.value = ""; }
    if (r) router.refresh();
  }, [state, r, router]);
  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setShowReport(false);
    // Le fichier déposé est placé dans le champ du formulaire
    if (input.current && f !== input.current.files?.[0]) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.current.files = dt.files;
    }
  };
  const lines: string[] = [];
  if (r) {
    if (r.mercurial) lines.push(`${x.r.mercurial} : ${r.mercurial.created} ${x.created}, ${r.mercurial.updated} ${x.updated}, ${r.mercurial.deactivated} ${x.deactivated}`);
    if (r.maj != null) lines.push(`${x.r.maj} : ${r.maj} ${x.lines}`);
    if (r.fv != null) lines.push(`${x.r.fv} : ${r.fv} ${x.lines}`);
    if (r.bakery) lines.push(`${x.r.bakery} : ${r.bakery.days} ${x.days}`);
    if (r.lockedList) lines.push(`${x.r.locked} : ${r.lockedList.matched} ${x.lockedMatched}`);
    if (r.meatFish) lines.push(`${r.meatFish.kind === "viande" ? t.meatFish.meat : t.meatFish.fish} ${r.meatFish.year} : ${r.meatFish.entries} ${x.mfEntries}`);
    if (r.control) lines.push(`${x.r.control} : ${r.control.weighGaps} ${x.weighGaps}, ${r.control.anomalies} ${x.anomaliesCount}`);
  }
  return (
    <form
      action={(fd) => { setShowReport(true); action(fd); }}
      className="card max-w-2xl space-y-4 p-5"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
    >
      <input
        ref={input}
        type="file"
        name="file"
        accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${over ? "border-brand-500 bg-brand-50" : "border-stone-300 hover:border-brand-400 hover:bg-stone-50"}`}
      >
        <Icon name="file" className="h-8 w-8 text-stone-400" />
        {file ? (
          <span className="font-semibold text-brand-800">{file.name}</span>
        ) : (
          <>
            <span className="font-semibold">{x.drop}</span>
            <span className="text-xs text-stone-500">{x.dropHint}</span>
          </>
        )}
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pending || !file}>
          <Icon name="download" className="h-4 w-4 rotate-180" /> {pending ? x.running : x.run}
        </button>
        {file && !pending && (
          <button type="button" className="btn-ghost" onClick={() => { setFile(null); if (input.current) input.current.value = ""; }}>{x.removeFile}</button>
        )}
      </div>
      {state?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{x.errors[state.error as keyof typeof x.errors] ?? t.common.error}</p>}
      {r && showReport && (
        lines.length ? (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="mb-1 font-semibold">✓ {x.done}</p>
            <ul className="list-inside list-disc space-y-0.5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{x.nothing}</p>
        )
      )}
    </form>
  );
}
