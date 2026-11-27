"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { fmtNo } from "@/lib/numbering";
import { matches } from "@/lib/search";
import { DateField } from "@/components/DateField";
import { createReturnSlipAction } from "@/lib/actions/returns";

export type Delivery = { id: number; no: number; date: string; supplier: string; bl: string | null; openAnomalies: number; lines: { id: number; name: string; unit: string; qty: number | null; price: number | null }[] };
type Pick = { on: boolean; qty: string; unit: string; reason: string };

const ddmmyy = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "2-digit" });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export function ReturnSlipForm({ deliveries, reasons, preselect }: { deliveries: Delivery[]; reasons: string[]; preselect: number | null }) {
  const { t } = useI18n();
  const R = t.returnSlip;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<number | null>(preselect && deliveries.some((d) => d.id === preselect) ? preselect : null);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const shown = useMemo(() => deliveries.filter((d) => !q.trim() || matches(`${d.supplier} ${d.bl ?? ""} ${fmtNo("reception", d.no)}`, q)).slice(0, 40), [deliveries, q]);
  const sel = deliveries.find((d) => d.id === selId) ?? null;
  const sortedReasons = [...reasons].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const pick = (lineId: number) => picks[lineId] ?? { on: false, qty: "", unit: "", reason: "" };
  const setPick = (lineId: number, p: Partial<Pick>) => setPicks((s) => ({ ...s, [lineId]: { ...pick(lineId), ...p } }));
  const num = (x: string) => { const n = parseFloat(x.replace(",", ".")); return Number.isFinite(n) ? n : null; };

  const save = () => {
    if (!sel) return;
    const items = sel.lines.filter((l) => pick(l.id).on && (num(pick(l.id).qty) ?? 0) > 0).map((l) => ({ lineId: l.id, qty: num(pick(l.id).qty)!, unit: pick(l.id).unit || l.unit, reason: pick(l.id).reason || null }));
    if (!items.length) return setError(R.noneSelected);
    setError("");
    start(async () => {
      const res = await createReturnSlipAction({ receptionId: sel.id, date, items }).catch(() => null);
      if (res && "ok" in res) { router.push(`/receptions/reprise/${res.id}`); router.refresh(); }
      else setError(R.saveFailed);
    });
  };

  return (
    <div className="space-y-3">
      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">{R.step1}</h2>
        {sel ? (
          <button type="button" onClick={() => { setSelId(null); setPicks({}); }} className="flex w-full items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-2.5 text-left text-sm">
            <span className="mt-0.5 h-4 w-4 flex-none rounded bg-amber-500" />
            <span><b>{fmtNo("reception", sel.no)}</b> · {ddmmyy(sel.date)} · {sel.supplier}{sel.bl ? ` · ${sel.bl}` : ""}<br /><span className="text-xs text-stone-500">{sel.lines.length} {R.products}{sel.openAnomalies ? ` · ${sel.openAnomalies} ${R.pending}` : ""} · {t.common.edit.toLowerCase()} ✕</span></span>
          </button>
        ) : (
          <>
            <p className="text-xs text-stone-500">{R.pickReception}</p>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={R.searchSupplier} autoFocus />
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {shown.map((d) => (
                <button key={d.id} type="button" onClick={() => setSelId(d.id)} className="flex w-full items-start gap-2 rounded-lg border border-stone-200 p-2.5 text-left text-sm hover:border-amber-400 hover:bg-amber-50">
                  <span className="mt-0.5 h-4 w-4 flex-none rounded border-2 border-stone-300" />
                  <span><b>{fmtNo("reception", d.no)}</b> · {ddmmyy(d.date)} · {d.supplier}{d.bl ? ` · ${d.bl}` : ""}<br /><span className="text-xs text-stone-500">{d.lines.length} {R.products}{d.openAnomalies ? ` · ${d.openAnomalies} ${R.pending}` : ""}</span></span>
                </button>
              ))}
              {!shown.length && <p className="py-3 text-center text-sm text-stone-500">{R.noReception}</p>}
            </div>
          </>
        )}
      </section>

      {sel && (
        <section className="card space-y-2 p-4">
          <h2 className="font-semibold">{R.step2}</h2>
          <p className="text-xs text-stone-500">{R.pickProducts}</p>
          {sel.lines.map((l) => {
            const p = pick(l.id);
            return (
              <div key={l.id} className={`rounded-lg border p-2.5 text-sm ${p.on ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-500" checked={p.on} onChange={(e) => setPick(l.id, { on: e.target.checked, ...(e.target.checked && !p.qty ? { qty: l.qty != null ? String(l.qty).replace(".", ",") : "", unit: l.unit } : {}) })} />
                  <span><b>{l.name}</b> <span className="text-xs text-stone-500">({R.delivered} : {l.qty != null ? `${String(l.qty).replace(".", ",")} ` : ""}{l.unit})</span></span>
                </label>
                {p.on && (
                  <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                    <label><span className="mb-0.5 block text-xs text-stone-600">{t.wizard.returnQty}</span><input className="input py-1.5" inputMode="decimal" value={p.qty} onChange={(e) => setPick(l.id, { qty: e.target.value })} /></label>
                    <label><span className="mb-0.5 block text-xs text-stone-600">{t.common.unit}</span><input className="input py-1.5" value={p.unit} onChange={(e) => setPick(l.id, { unit: e.target.value })} /></label>
                    <label className="col-span-2"><span className="mb-0.5 block text-xs text-stone-600">{t.wizard.chooseReason}</span>
                      <select className="input py-1.5" value={p.reason} onChange={(e) => setPick(l.id, { reason: e.target.value })}>
                        <option value="">—</option>
                        {sortedReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
          <label className="block max-w-xs"><span className="label">{R.date}</span><DateField value={date} onChange={(v) => setDate(v || today())} /></label>
          <p className="rounded-lg bg-stone-50 p-2 text-xs text-stone-600">{R.effect}</p>
          {error && <p className="text-sm font-medium text-red-700">⚠ {error}</p>}
          <button type="button" className="btn-primary w-full !bg-amber-500 hover:!bg-amber-600" disabled={pending} onClick={save}>{pending ? R.saving : R.save}</button>
        </section>
      )}
    </div>
  );
}
