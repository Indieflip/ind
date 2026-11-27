"use client";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Catalog, Draft } from "@/lib/reception-types";
import { fmtMoney } from "@/lib/format";
import { matches } from "@/lib/search";
import { Icon } from "../Icon";
import { lineFromProduct } from "./helpers";

type OriginLine = { productId: number | null; name: string; unit: string; categoryId: number | null; lot: string; reason: string; ref: string; qty: number | null; price: number | null };
export type Origin = { id: number; no: string; date: string; bl: string | null; docs: string[]; total: number; lines: OriginLine[] };
type Mode = "day" | "week" | "month";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parisDay = (v: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(v));

/** Bornes de la période (jour, semaine du lundi au dimanche, mois) contenant la date */
function range(mode: Mode, anchor: Date) {
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (mode === "day") return { from: a, to: a };
  if (mode === "week") {
    const from = new Date(a); from.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    const to = new Date(from); to.setDate(from.getDate() + 6);
    return { from, to };
  }
  return { from: new Date(a.getFullYear(), a.getMonth(), 1), to: new Date(a.getFullYear(), a.getMonth() + 1, 0) };
}
function shift(mode: Mode, anchor: Date, dir: number) {
  const d = new Date(anchor);
  if (mode === "day") d.setDate(d.getDate() + dir);
  else if (mode === "week") d.setDate(d.getDate() + 7 * dir);
  else d.setMonth(d.getMonth() + dir, 1);
  return d;
}

/** Livraisons choisies d'un bon de reprise (la première = livraison d'origine, les autres en plus) */
export const chosenOrigins = (d: Draft) => [d.originReceptionId, ...(d.originExtraIds ?? [])].filter((x): x is number => !!x);

function useOrigins(draft: Draft, params: Record<string, string> | null) {
  const [list, setList] = useState<Origin[] | null>(null);
  const key = params ? new URLSearchParams(params).toString() : "";
  useEffect(() => {
    if (!params) return;
    const ctl = new AbortController();
    fetch(`/api/receptions/origins?${key}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { deliveries: [] }))
      .then((j) => setList(j.deliveries ?? []))
      .catch(() => {});
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  void draft;
  return list;
}

/** Étape Livraison d'un bon de reprise : « Pas de livraison » ou une ou plusieurs livraisons du fournisseur, par jour / semaine / mois */
export function OriginPicker({ draft, setDraft }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void }) {
  const { t, locale } = useI18n();
  const R = t.returnSlip;
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => new Date(draft.deliveredAt || Date.now()));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { from, to } = range(mode, anchor);
  const chosen = chosenOrigins(draft);
  const hasSupplier = !!draft.supplierId || !!draft.supplierName.trim();
  const list = useOrigins(draft, hasSupplier ? { supplierId: String(draft.supplierId ?? ""), supplierName: draft.supplierName, from: iso(from), to: iso(to), include: chosen.join(",") } : null);
  const inPeriod = (list ?? []).filter((o) => { const d = parisDay(o.date); return d >= iso(from) && d <= iso(to); });
  const shown = q.trim() ? inPeriod.filter((o) => matches(`${o.no} ${o.docs.join(" ")} ${o.lines.map((l) => l.name).join(" ")}`, q)) : inPeriod;
  const many = inPeriod.length > 10;
  const toggle = (id: number) => setDraft((d) => {
    const cur = chosenOrigins(d);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    return { ...d, noReturnDoc: false, originReceptionId: next[0] ?? null, originExtraIds: next.slice(1) };
  });
  const fmtDay = (v: string | Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { timeZone: "Europe/Paris", ...opts }).format(typeof v === "string" ? new Date(v) : v);
  const label = mode === "day" ? fmtDay(from, { weekday: "long", day: "2-digit", month: "2-digit", year: "2-digit" })
    : mode === "week" ? `${fmtDay(from, { day: "2-digit", month: "2-digit" })} – ${fmtDay(to, { day: "2-digit", month: "2-digit", year: "2-digit" })}`
    : fmtDay(from, { month: "long", year: "numeric" });
  const card = (o: Origin) => {
    const on = chosen.includes(o.id);
    return (
      <button key={o.id} type="button" onClick={() => toggle(o.id)} aria-pressed={on}
        className={`relative w-full rounded-xl border p-3 text-left transition ${on ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "border-stone-200 bg-white hover:border-amber-300"}`}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-bold">{o.no}</span>
          <span className="pr-5 text-xs text-stone-500">{fmtDay(o.date, { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-stone-600">{o.docs.join(" · ") || t.receptions.noBl}</span>
        <span className="mt-1 block text-xs font-medium text-stone-700">{o.lines.length} {R.products}{o.total ? ` · ${fmtMoney(o.total, locale)}` : ""}</span>
        {on && <span className="absolute right-2 top-2 rounded-full bg-amber-500 p-0.5 text-white"><Icon name="check" className="h-3 w-3" /></span>}
      </button>
    );
  };
  // Beaucoup de livraisons sur la période : récap par jour (repliable), recherche par N°, document ou produit
  const byDay = useMemo(() => {
    const m = new Map<string, Origin[]>();
    for (const o of shown) { const k = parisDay(o.date); m.set(k, [...(m.get(k) ?? []), o]); }
    return [...m.entries()];
  }, [shown]);
  const selected = (list ?? []).filter((o) => chosen.includes(o.id));

  return (
    <section className="space-y-3 rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><span className="rounded-lg bg-amber-500 px-1.5 text-white">↩</span> {R.originTitle}</h3>
        <button type="button" onClick={() => setDraft((d) => ({ ...d, noReturnDoc: !d.noReturnDoc, ...(!d.noReturnDoc ? { originReceptionId: null, originExtraIds: [] } : {}) }))}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${draft.noReturnDoc ? "border-stone-700 bg-stone-800 text-white" : "border-stone-300 bg-white text-stone-700"}`}>
          {draft.noReturnDoc ? "✓ " : ""}{R.noDelivery}
        </button>
      </div>
      {draft.noReturnDoc ? <p className="text-sm text-stone-600">{R.noDeliveryHint}</p> : !hasSupplier ? <p className="text-sm text-stone-500">{R.pickSupplierFirst}</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
              {(["day", "week", "month"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-3 py-1 font-medium ${mode === m ? "bg-amber-500 text-white" : "text-stone-600"}`}>{R.periods[m]}</button>
              ))}
            </div>
            <div className="flex flex-1 items-center justify-between gap-1 rounded-lg border border-stone-200 bg-white px-1">
              <button type="button" className="btn-ghost p-1.5" aria-label="‹" onClick={() => setAnchor((a) => shift(mode, a, -1))}><Icon name="chevronLeft" className="h-4 w-4" /></button>
              <span className="text-sm font-medium capitalize">{label}</span>
              <button type="button" className="btn-ghost p-1.5" aria-label="›" onClick={() => setAnchor((a) => shift(mode, a, 1))}><Icon name="chevronRight" className="h-4 w-4" /></button>
            </div>
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((o) => (
                <button key={o.id} type="button" onClick={() => toggle(o.id)} className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
                  {o.no} · {fmtDay(o.date, { day: "2-digit", month: "2-digit" })} <span aria-hidden>✕</span>
                </button>
              ))}
            </div>
          )}
          {many && <input className="input py-2 text-sm" placeholder={R.searchOrigin} value={q} onChange={(e) => setQ(e.target.value)} />}
          {list == null ? <p className="animate-pulse text-sm text-stone-500">{R.originLoading}</p>
            : shown.length === 0 ? <p className="text-sm text-stone-500">{R.noOriginInPeriod}</p>
            : !many ? <div className="grid gap-2 sm:grid-cols-2">{shown.map(card)}</div>
            : (
              <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
                <p className="bg-stone-50 px-3 py-2 text-xs text-stone-600"><strong>{inPeriod.length}</strong> {R.deliveriesInPeriod} · {fmtMoney(inPeriod.reduce((s, o) => s + o.total, 0), locale)}</p>
                {byDay.map(([day, items]) => {
                  const isOpen = open[day] ?? (!!q.trim() || items.some((o) => chosen.includes(o.id)));
                  return (
                    <div key={day}>
                      <button type="button" onClick={() => setOpen((x) => ({ ...x, [day]: !isOpen }))} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-stone-50">
                        <span className="font-medium capitalize">{fmtDay(`${day}T12:00:00`, { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                        <span className="flex items-center gap-2 text-xs text-stone-600">
                          {items.length} {R.deliveriesShort} · {fmtMoney(items.reduce((s, o) => s + o.total, 0), locale)}
                          {items.some((o) => chosen.includes(o.id)) && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                          <span className={`transition ${isOpen ? "rotate-90" : ""}`}>▸</span>
                        </span>
                      </button>
                      {isOpen && <div className="grid gap-2 bg-stone-50/60 p-2 sm:grid-cols-2">{items.map(card)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          <p className="text-xs text-stone-600">{chosen.length ? R.originHintStep2 : R.autoAnomaly}</p>
        </>
      )}
    </section>
  );
}

/** Étape Contrôle d'un bon de reprise : produits des livraisons choisies, à reprendre un par un ou tous */
export function OriginProducts({ draft, setDraft, catalog }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; catalog?: Catalog }) {
  const { t, locale } = useI18n();
  const R = t.returnSlip;
  const chosen = chosenOrigins(draft);
  const list = useOrigins(draft, chosen.length ? { include: chosen.join(",") } : null);
  const [open, setOpen] = useState(true);
  if (!chosen.length || draft.noReturnDoc) return null;
  const fmt = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  const key = (name: string, origin: number | null | undefined) => `${name.trim().toLowerCase()}|${origin ?? ""}`;
  const have = new Set(draft.lines.map((l) => key(l.productName, l.originReceptionId)));
  const add = (o: Origin, items: OriginLine[]) => setDraft((d) => {
    const got = new Set(d.lines.map((l) => key(l.productName, l.originReceptionId)));
    const added = items.filter((x) => !got.has(key(x.name, o.id))).map((x) => {
      const p = x.productId ? catalog?.products.find((c) => c.id === x.productId) ?? null : null;
      return lineFromProduct(p, { productId: x.productId, productName: x.name, unit: x.unit || p?.unit || "Pièce", categoryId: x.categoryId ?? p?.categoryId ?? null,
        qtyOrdered: fmt(x.qty), qtyReceived: fmt(x.qty), unitPrice: fmt(x.price), lot: x.lot, reason: x.reason, decision: "conform",
        originReceptionId: o.id, originRef: x.ref });
    });
    return { ...d, lines: [...d.lines, ...added] };
  });
  const sel = (list ?? []).filter((o) => chosen.includes(o.id));
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 bg-amber-50 px-4 py-3 text-left">
        <span className="font-semibold">↩ {R.originProducts}</span>
        <span className={`text-stone-400 transition ${open ? "rotate-90" : ""}`}>▸</span>
      </button>
      {open && (list == null ? <p className="animate-pulse p-4 text-sm text-stone-500">{R.originLoading}</p> : (
        <div className="divide-y divide-stone-100">
          {sel.map((o) => {
            const left = o.lines.filter((x) => !have.has(key(x.name, o.id)));
            return (
              <div key={o.id} className="p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm"><strong>{o.no}</strong> <span className="text-stone-500">· {o.docs.join(" · ") || t.receptions.noBl}</span></p>
                  <button type="button" disabled={!left.length} onClick={() => add(o, left)} className="btn-secondary px-3 py-1 text-sm disabled:opacity-50">
                    <Icon name="plus" className="h-4 w-4" /> {R.takeAll} ({left.length})
                  </button>
                </div>
                <ul className="space-y-1">
                  {o.lines.map((x, i) => {
                    const added = have.has(key(x.name, o.id));
                    return (
                      <li key={i} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${added ? "bg-emerald-50" : "bg-stone-50"}`}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{x.name}</span>
                          <span className="block text-xs text-stone-500">{fmt(x.qty) || "—"} {x.unit}{x.price != null ? ` · ${fmtMoney(x.price, locale)}` : ""}</span>
                        </span>
                        {added ? <span className="shrink-0 text-xs font-semibold text-emerald-700">✓ {R.added}</span>
                          : <button type="button" onClick={() => add(o, [x])} className="btn-primary shrink-0 !bg-amber-500 px-3 py-1 text-sm hover:!bg-amber-600"><Icon name="plus" className="h-4 w-4" /> {R.take}</button>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
