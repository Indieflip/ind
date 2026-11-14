"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createAnomalyAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { PhotoButton, Thumbs } from "@/components/reception/PhotoButton";

export function AnomalyForm({ suppliers }: { suppliers: { id: number; name: string }[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState("");
  const [state, action, pending] = useActionState(createAnomalyAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) { ref.current?.reset(); setPhoto(""); setOpen(false); }
  }, [state]);

  if (!open) {
    return <button className="btn-primary no-print mb-4" onClick={() => setOpen(true)}><Icon name="plus" className="h-4 w-4" /> {t.anomalies.new}</button>;
  }
  return (
    <form ref={ref} action={action} className="no-print card mb-4 space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t.anomalies.new}</h2>
        <button type="button" className="btn-ghost p-1.5" onClick={() => setOpen(false)}><Icon name="x" className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">{t.common.supplier} *</span>
          <select name="supplierId" className="input" required defaultValue="">
            <option value="" />
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          <span className="label">{t.anomalies.type}</span>
          <select name="type" className="input" defaultValue="missing">
            {Object.entries(t.anomalies.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          <span className="label">{t.common.product}</span>
          <input name="productName" className="input" />
        </label>
      </div>
      <label className="block">
        <span className="label">{t.anomalies.description} *</span>
        <textarea name="description" className="input" rows={2} required placeholder={t.anomalies.descriptionPlaceholder} />
      </label>
      <input type="hidden" name="photo" value={photo} />
      <Thumbs photos={photo ? [photo] : []} onRemove={() => setPhoto("")} />
      <div className="flex flex-wrap gap-2">
        {!photo && <PhotoButton label={t.common.photo} onPhotos={(p) => setPhoto(p[0])} />}
        <button className="btn-primary" disabled={pending}>{t.common.save}</button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{t.common.error}</p>}
    </form>
  );
}

export function AnomalyManage({ id, status, creditAmount, followUp }: { id: number; status: string; creditAmount: string; followUp: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <div className="no-print mt-3 grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-[auto_10rem_1fr]">
      <select className="input py-2" defaultValue={status} disabled={pending} onChange={(e) => start(() => updateAnomalyAction(id, { status: e.target.value }))}>
        {Object.entries(t.anomalies.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input
        className="input py-2"
        inputMode="decimal"
        placeholder={t.anomalies.credit}
        defaultValue={creditAmount}
        onBlur={(e) => e.target.value !== creditAmount && start(() => updateAnomalyAction(id, { creditAmount: e.target.value }))}
      />
      <input
        className="input py-2"
        placeholder={t.anomalies.followUp}
        defaultValue={followUp}
        onBlur={(e) => e.target.value !== followUp && start(() => updateAnomalyAction(id, { followUp: e.target.value }))}
      />
    </div>
  );
}
