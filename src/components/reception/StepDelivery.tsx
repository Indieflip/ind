"use client";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, Draft } from "@/lib/reception-types";
import { Icon } from "../Icon";
import { matches } from "./helpers";

export function StepDelivery({ draft, setDraft, catalog }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; catalog?: Catalog }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const suppliers = useMemo(() => (catalog?.suppliers ?? []).filter((s) => !q || matches(s.name, q)), [catalog, q]);
  const selected = catalog?.suppliers.find((s) => s.id === draft.supplierId);
  const [picking, setPicking] = useState(!draft.supplierId && !draft.otherSupplier);

  return (
    <>
      <section className="card p-4">
        <h2 className="label">{t.wizard.chooseSupplier}</h2>
        {!picking && (selected || draft.otherSupplier) ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-3">
            <span className="font-semibold text-brand-700">{draft.otherSupplier ? `${t.wizard.otherSupplier} :` : selected?.name}</span>
            <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={() => setPicking(true)}>
              {t.common.edit}
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-stone-400" />
              <input className="input pl-10" placeholder={t.wizard.searchSupplier} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="mt-2 max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-3 text-left hover:bg-stone-50 active:bg-brand-50"
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        supplierId: s.id,
                        supplierName: s.name,
                        otherSupplier: false,
                        driverName: d.supplierId === s.id && d.driverName ? d.driverName : s.drivers[0] ?? "",
                        lines: d.supplierId === s.id ? d.lines : [],
                      }));
                      setPicking(false);
                      setQ("");
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-3 text-left font-medium text-brand-700 hover:bg-stone-50"
                  onClick={() => {
                    setDraft((d) => ({ ...d, supplierId: null, supplierName: q, otherSupplier: true, lines: [] }));
                    setPicking(false);
                  }}
                >
                  + {t.wizard.otherSupplier}
                </button>
              </li>
            </ul>
          </>
        )}
        {draft.otherSupplier && !picking && (
          <input
            className="input mt-2"
            autoFocus
            placeholder={t.wizard.otherSupplierName}
            value={draft.supplierName}
            onChange={(e) => setDraft((d) => ({ ...d, supplierName: e.target.value }))}
          />
        )}
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <label className="label">{t.wizard.dateTime}</label>
          <input
            type="datetime-local"
            className="input"
            value={draft.deliveredAt}
            onChange={(e) => setDraft((d) => ({ ...d, deliveredAt: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t.wizard.blNumber}</label>
            <input className="input" value={draft.blNumber} onChange={(e) => setDraft((d) => ({ ...d, blNumber: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t.wizard.driverName}</label>
            <input
              className="input"
              list="drivers"
              value={draft.driverName}
              onChange={(e) => setDraft((d) => ({ ...d, driverName: e.target.value }))}
            />
            <datalist id="drivers">
              {selected?.drivers.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
        </div>
        <div>
          <label className="label">{t.wizard.truckTemp}</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="ex. 3"
            value={draft.truckTemp}
            onChange={(e) => setDraft((d) => ({ ...d, truckTemp: e.target.value }))}
          />
          <p className="mt-1 text-xs text-stone-500">{t.wizard.truckTempHint}</p>
        </div>
        <div>
          <span className="label">{t.wizard.vehicleClean}</span>
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, vehicleClean: d.vehicleClean === v ? null : v }))}
                className={`btn border ${draft.vehicleClean === v ? (v ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-800") : "border-stone-300 bg-white"}`}
              >
                {v ? t.common.yes : t.common.no}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
