"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importExcelAction } from "@/lib/actions/excel";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

export function ImportForm() {
  const { t } = useI18n();
  const x = t.excelImport;
  const [state, action, pending] = useActionState(importExcelAction, undefined);
  const r = state?.report;
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [showReport, setShowReport] = useState(true);
  const clearFile = () => { setFileName(""); setInputKey((k) => k + 1); };
  // Après chaque import : le champ fichier est vidé, on peut en choisir un autre
  useEffect(() => { if (state) clearFile(); if (r) router.refresh(); }, [state, r, router]);
  return (
    <div className="max-w-2xl space-y-4">
      <form ref={form} action={(fd) => { setShowReport(true); action(fd); }} className="card space-y-4 p-4">
        <p className="text-sm text-stone-600">{x.intro}</p>
        <ul className="list-inside list-disc text-xs text-stone-500">{x.kinds.map((k) => <li key={k}>{k}</li>)}</ul>
        <input
          key={inputKey}
          ref={input}
          type="file"
          name="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="sr-only"
          onChange={(e) => { setFileName(e.target.files?.[0]?.name ?? ""); setShowReport(false); }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => input.current?.click()}>
            <Icon name="file" className="h-4 w-4" /> {fileName ? x.changeFile : x.chooseFile}
          </button>
          {fileName ? (
            <span className="flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-sm font-medium text-brand-800">
              {fileName}
              <button type="button" className="px-1 text-stone-500 hover:text-red-600" aria-label={x.removeFile} title={x.removeFile} onClick={clearFile}>✕</button>
            </span>
          ) : (
            <span className="text-sm text-stone-500">{x.noFile}</span>
          )}
        </div>
        <fieldset className="space-y-3">
          <legend className="label">{x.sheets}</legend>
          {(
            [
              [x.groupMercurial, [["mercurial", x.mercurial], ["maj", x.maj], ["fv", x.fv], ["bakery", x.bakery], ["locked", x.locked]]],
              [x.groupControl, [["gaps", x.gaps], ["anomalies", x.anomalies], ["process", x.process], ["info", x.info]]],
            ] as const
          ).map(([group, items]) => (
            <div key={group} className="rounded-lg border border-stone-200 p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{group}</p>
              {items.map(([k, label]) => (
                <label key={k} className="flex items-start gap-2 py-0.5 text-sm">
                  <input type="checkbox" name={k} defaultChecked className="mt-0.5 h-4 w-4 accent-brand-600" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          ))}
          <div className="rounded-lg border border-stone-200 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{x.groupMeat}</p>
            <p className="text-sm text-stone-600">{x.meatSheets}</p>
          </div>
        </fieldset>
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{x.warning}</p>
        <button className="btn-primary" disabled={pending || !fileName}><Icon name="download" className="h-4 w-4 rotate-180" /> {pending ? x.running : x.run}</button>
        {state?.error && <p className="text-sm text-red-600">{x.errors[state.error as keyof typeof x.errors] ?? t.common.error}</p>}
      </form>
      {r && showReport && (
        <div className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-emerald-700">{x.done}</h2>
          {r.mercurial && <p>{x.mercurial} : {r.mercurial.created} {x.created}, {r.mercurial.updated} {x.updated}, {r.mercurial.deactivated} {x.deactivated}, {r.mercurial.suppliers} {x.newSuppliers}</p>}
          {r.maj != null && <p>{x.maj} : {r.maj} {x.lines}</p>}
          {r.fv != null && <p>{x.fv} : {r.fv} {x.lines}{r.fvLocked ? ` (${r.fvLocked} 🔒)` : ""}</p>}
          {r.bakery && <p>{x.bakery} : {r.bakery.days} {x.days}</p>}
          {r.meatFish && <p>{r.meatFish.kind === "viande" ? t.meatFish.meat : t.meatFish.fish} {r.meatFish.year} : {r.meatFish.entries} {x.mfEntries}, {r.meatFish.products} {x.mfProducts}, {r.meatFish.months} {x.mfMonths}</p>}
          {r.control && <p>{x.control} : {r.control.weighGaps} {x.weighGaps}, {r.control.anomalies} {x.anomaliesCount}{r.control.protocols.length ? ` · ${x.protocolsUpdated} : ${r.control.protocols.join(", ")}` : ""}</p>}
          {r.lockedList && <p>{x.locked} : {r.lockedList.matched} / {r.lockedList.listed} {x.lockedMatched}</p>}
          {r.missing.length > 0 && <p className="text-amber-700">{x.missing} : {r.missing.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
