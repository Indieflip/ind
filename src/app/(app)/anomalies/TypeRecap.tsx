"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Period = "mois" | "trimestre" | "annee" | "perso";
export type RecapItem = { d: string; k: string; amt: number };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeOf(p: Period, today: string, from: string, to: string): [string, string] {
  const [y, m] = today.split("-").map(Number);
  if (p === "mois") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (p === "trimestre") { const q0 = Math.floor((m - 1) / 3) * 3; return [iso(new Date(y, q0, 1)), iso(new Date(y, q0 + 3, 0))]; }
  if (p === "annee") return [`${y}-01-01`, `${y}-12-31`];
  return from <= to ? [from, to] : [to, from];
}

/**
 * Récap par type d'anomalie : le changement de fréquence est calculé dans le navigateur (instantané),
 * le clic sur un type filtre le tableau / la liste en dessous.
 */
export function TypeRecap({ items, types, today, typeFilter, baseQs, initialOpen }: { items: RecapItem[]; types: string[]; today: string; typeFilter: string; baseQs: Record<string, string>; initialOpen: boolean }) {
  const { t, locale } = useI18n();
  const A = t.anomalies;
  const [p, setP] = useState<Period>("mois");
  const [y, m] = today.split("-").map(Number);
  const [from, setFrom] = useState(iso(new Date(y, m - 1, 1)));
  const [to, setTo] = useState(today);
  const [rFrom, rTo] = rangeOf(p, today, from, to);
  const { rows, total } = useMemo(() => {
    // Tous les types d'anomalie, même sans fiche sur la période
    const map = new Map<string, { n: number; amount: number }>(types.map((k) => [k, { n: 0, amount: 0 }]));
    for (const it of items) {
      if (it.d < rFrom || it.d > rTo) continue;
      const e = map.get(it.k) ?? { n: 0, amount: 0 };
      map.set(it.k, { n: e.n + 1, amount: e.amount + it.amt });
    }
    const rows = [...map].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "fr"));
    return { rows, total: rows.reduce((acc, [, v]) => ({ n: acc.n + v.n, amount: acc.amount + v.amount }), { n: 0, amount: 0 }) };
  }, [items, types, rFrom, rTo]);
  const typeHref = (ty: string) => `/anomalies?${new URLSearchParams({ ...baseQs, ...(ty ? { type: ty } : {}) })}`;
  // « Détail » : la liste des fiches d'anomalie de ce type
  const detailHref = (ty: string) => `/anomalies?${new URLSearchParams({ view: "liste", type: ty })}`;

  return (
    <details open={initialOpen} className="group mb-4 rounded-xl border border-stone-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <span><strong>{A.typeRecap}</strong> · {total.n} {A.sheetsLabel} · {fmtMoney(total.amount, locale)}{typeFilter ? ` · ${A.filteredOn} « ${typeFilter} »` : ""}</span>
        <span className="text-stone-400 transition group-open:rotate-90">▸</span>
      </summary>
      <div className="space-y-3 border-t border-stone-100 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-500">{A.frequency} :</span>
          {(["mois", "trimestre", "annee", "perso"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setP(k)} className={`rounded-lg px-3 py-1.5 font-medium ${p === k ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}>{A.periods[k]}</button>
          ))}
          {p === "perso" && (
            <span className="flex flex-wrap items-center gap-1.5">
              <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="input w-auto py-1 text-sm" aria-label={t.common.from} />
              <span className="text-stone-400">→</span>
              <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="input w-auto py-1 text-sm" aria-label={t.common.to} />
            </span>
          )}
          <span className="text-xs text-stone-500">{fmtDate(rFrom, locale)} → {fmtDate(rTo, locale)}</span>
        </div>
        <table className="table max-w-2xl text-sm">
          <thead><tr><th>{t.sheet.problemType}</th><th className="text-right">{A.count}</th><th className="text-right">{A.amount}</th><th className="text-right">{A.detail}</th></tr></thead>
          <tbody>
            {rows.map(([ty, v]) => (
              <tr key={ty} className={ty === typeFilter ? "bg-brand-50" : v.n ? "" : "text-stone-400"}>
                <td><Link href={typeHref(ty === typeFilter ? "" : ty)} className={`font-medium hover:underline ${v.n ? "text-brand-700" : "text-stone-500"}`}>{ty}</Link></td>
                <td className="text-right tabular-nums">{v.n}</td>
                <td className="text-right tabular-nums">{fmtMoney(v.amount, locale)}</td>
                <td className="text-right"><Link href={detailHref(ty)} className="text-sm text-brand-700 hover:underline">{A.seeSheets} →</Link></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="py-4 text-center text-stone-500">{A.noneInPeriod}</td></tr>}
            <tr className="font-semibold"><td>{t.common.total}</td><td className="text-right tabular-nums">{total.n}</td><td className="text-right tabular-nums">{fmtMoney(total.amount, locale)}</td><td /></tr>
          </tbody>
        </table>
        <p className="text-xs text-stone-500">{A.recapHint}</p>
        {typeFilter && <Link href={typeHref("")} className="btn-ghost text-sm">✕ {A.clearType}</Link>}
      </div>
    </details>
  );
}
