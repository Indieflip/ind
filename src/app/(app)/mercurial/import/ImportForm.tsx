"use client";
import { useActionState, useEffect } from "react";
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
  useEffect(() => { if (r) router.refresh(); }, [r, router]);
  return (
    <div className="max-w-2xl space-y-4">
      <form action={action} className="card space-y-4 p-4">
        <p className="text-sm text-stone-600">{x.intro}</p>
        <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="block text-sm" />
        <fieldset className="space-y-2">
          <legend className="label">{x.sheets}</legend>
          {(
            [
              ["mercurial", x.mercurial],
              ["maj", x.maj],
              ["fv", x.fv],
              ["bakery", x.bakery],
              ["locked", x.locked],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={k} defaultChecked className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{x.warning}</p>
        <button className="btn-primary" disabled={pending}><Icon name="download" className="h-4 w-4 rotate-180" /> {pending ? x.running : x.run}</button>
        {state?.error && <p className="text-sm text-red-600">{x.errors[state.error as keyof typeof x.errors] ?? t.common.error}</p>}
      </form>
      {r && (
        <div className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-emerald-700">{x.done}</h2>
          {r.mercurial && <p>{x.mercurial} : {r.mercurial.created} {x.created}, {r.mercurial.updated} {x.updated}, {r.mercurial.deactivated} {x.deactivated}, {r.mercurial.suppliers} {x.newSuppliers}</p>}
          {r.maj != null && <p>{x.maj} : {r.maj} {x.lines}</p>}
          {r.fv != null && <p>{x.fv} : {r.fv} {x.lines}{r.fvLocked ? ` (${r.fvLocked} 🔒)` : ""}</p>}
          {r.bakery && <p>{x.bakery} : {r.bakery.days} {x.days}</p>}
          {r.lockedList && <p>{x.locked} : {r.lockedList.matched} / {r.lockedList.listed} {x.lockedMatched}</p>}
          {r.missing.length > 0 && <p className="text-amber-700">{x.missing} : {r.missing.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
