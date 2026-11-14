"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addPriceLineAction, saveClaimAction } from "@/lib/actions/prices";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";

/** Réclamation : enregistrée dès qu'on quitte le champ */
export function ClaimCell({ id, initial, placeholder }: { id: number; initial: string; placeholder: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const last = useRef(initial);
  return (
    <div className="relative">
      <textarea
        rows={1}
        className="input min-h-9 resize-y py-1.5 text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={async () => {
          if (value === last.current) return;
          setState("saving");
          await saveClaimAction(id, value);
          last.current = value;
          setState("saved");
          setTimeout(() => setState("idle"), 1500);
        }}
      />
      {state !== "idle" && <span className="absolute right-2 top-2 text-xs text-emerald-600">{state === "saving" ? "…" : <Icon name="check" className="h-4 w-4" />}</span>}
    </div>
  );
}

interface P { id: number; name: string; supplierId: number; price: number | null; unit: string }

export function AddPriceLine({ suppliers, products }: { suppliers: { id: number; name: string }[]; products: P[] }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [state, action, pending] = useActionState(addPriceLineAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const list = useMemo(() => products.filter((p) => String(p.supplierId) === supplierId), [products, supplierId]);
  const product = products.find((p) => String(p.id) === productId);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setProductId("");
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button className="btn-primary no-print mb-4" onClick={() => setOpen(true)}>
        <Icon name="plus" className="h-4 w-4" /> {t.prices.addLine}
      </button>
    );
  }
  return (
    <form ref={formRef} action={action} className="no-print card mb-4 space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t.prices.addLine}</h2>
        <button type="button" className="btn-ghost p-1.5" onClick={() => setOpen(false)}><Icon name="x" className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-stone-500">{t.prices.addLineHint}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2">
          <span className="label">{t.common.supplier}</span>
          <select className="input" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setProductId(""); }} required>
            <option value="" />
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="lg:col-span-2">
          <span className="label">{t.common.product}</span>
          <select className="input" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} required disabled={!supplierId}>
            <option value="" />
            {list.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
        </label>
        <label>
          <span className="label">{t.prices.old}</span>
          <input className="input bg-stone-50" readOnly value={product ? fmtMoney(product.price, locale) : ""} />
        </label>
        <label>
          <span className="label">{t.prices.new}</span>
          <input className="input" name="newPrice" inputMode="decimal" required />
        </label>
        <label>
          <span className="label">{t.prices.source}</span>
          <select className="input" name="source">
            <option value="invoice">{t.prices.sources.invoice}</option>
            <option value="manual">{t.prices.sources.manual}</option>
          </select>
        </label>
        <label>
          <span className="label">{t.prices.invoiceRef}</span>
          <input className="input" name="invoiceRef" />
        </label>
        <label className="sm:col-span-2 lg:col-span-4">
          <span className="label">{t.prices.claim} / {t.common.notes}</span>
          <input className="input" name="claim" placeholder={t.prices.claimPlaceholder} />
        </label>
      </div>
      {state?.error && <p className="text-sm text-red-600">{t.common.error}</p>}
      <button className="btn-primary" disabled={pending}>{t.common.save}</button>
    </form>
  );
}
