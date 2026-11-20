"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveProjectDocAction, saveProjectRoiAction } from "@/lib/actions/dev";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { RichEditor, RichView } from "../protocoles/RichEditor";
import { MODULES_LIVE, MODULES_TODO } from "./projectModules";

export interface ProjectKpis {
  since: string | null; months: number; receptions: number; lines: number; anomalies: number; claims: number;
  obtained: number; pending: number; rate: number | null; priceChanges: number; sheets: number; users: number;
}
export interface Roi { monthlyCost: number; hoursPerWeek: number; hourlyRate: number; sites: number }

/** Dev > Projet : chiffres clés en direct, calcul coût / gains, document de travail (plan, concurrence, coût, objections…) */
export function DevProject({ doc, kpis, roi }: { doc: string; kpis: ProjectKpis; roi: Roi }) {
  const { t, locale } = useI18n();
  const p = t.devProject;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState(doc);
  const [r, setR] = useState(roi);
  const [pending, start] = useTransition();
  const money = (n: number) => fmtMoney(n, locale);

  const savingsPerMonth = kpis.obtained / Math.max(1, kpis.months);
  const timePerMonth = r.hoursPerWeek * r.hourlyRate * 52 / 12;
  const gains = savingsPerMonth + timePerMonth;
  const result = gains - r.monthlyCost;

  const kpi = (label: string, value: string, hint?: string, accent = false) => (
    <div className={`rounded-xl border p-3 ${accent ? "border-brand-200 bg-brand-50" : "border-stone-200 bg-white"}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${accent ? "text-brand-800" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-stone-500">{hint}</div>}
    </div>
  );
  // Sommaire du document : titres de niveau 2 ; un clic fait défiler jusqu'au titre
  const docRef = useRef<HTMLDivElement>(null);
  const toc = useMemo(() => [...doc.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim()).filter(Boolean), [doc]);
  const title = doc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1].replace(/<[^>]+>/g, "").trim();
  const goTo = (i: number) => docRef.current?.querySelectorAll("h2")[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  const field = (k: keyof Roi, label: string, suffix: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <span className="flex items-center gap-1">
        <input className="input py-1.5 text-right" inputMode="decimal" value={String(r[k])} onChange={(e) => setR({ ...r, [k]: Number(e.target.value.replace(",", ".")) || 0 })} />
        <span className="text-sm text-stone-500">{suffix}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      {/* En-tête : titre du projet et résultat du mois */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 p-5 text-white sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">{p.kpisTitle}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">{title ?? p.docTitle}</h2>
        <p className="mt-1 text-sm text-stone-300">{kpis.since ? `${p.since} ${kpis.since} · ${kpis.months} ${p.months}` : p.noData}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-stone-300">{p.obtained}</p><p className="text-2xl font-bold tabular-nums">{money(kpis.obtained)}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-stone-300">{p.gainsMonth}</p><p className="text-2xl font-bold tabular-nums">{money(gains)}</p></div>
          <div className={`rounded-xl p-3 ${result >= 0 ? "bg-emerald-500/20" : "bg-red-500/20"}`}><p className="text-xs text-stone-300">{p.resultMonth}</p><p className={`text-2xl font-bold tabular-nums ${result >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money(result)}</p></div>
        </div>
      </section>

      {/* Modules en place : mis à jour à chaque évolution de l'application */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-bold">{p.modulesLive}</h2>
          <span className="text-xs font-medium text-brand-700">{p.autoUpdated}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODULES_LIVE.map((m) => (
            <div key={m.title} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon name={m.icon} className="h-4 w-4" /></span>
                <h3 className="font-semibold leading-tight">{m.title}</h3>
              </div>
              <ul className="space-y-1 text-sm text-stone-600">{m.items.map((x) => <li key={x} className="flex gap-2"><Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{x}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      {/* Modules importants à ajouter */}
      <section>
        <h2 className="text-lg font-bold">{p.modulesTodo}</h2>
        <p className="mb-2 text-sm text-stone-600">{p.modulesTodoHint}</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MODULES_TODO.map((m) => (
            <div key={m.title} className={`flex flex-col rounded-xl border p-4 ${m.priority === "haute" ? "border-violet-300 bg-violet-50/60" : "border-dashed border-stone-300 bg-white"}`}>
              <div className="mb-1 flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><Icon name={m.icon} className="h-4 w-4" /></span>
                <h3 className="flex-1 font-semibold leading-tight">{m.title}</h3>
                <span className={`badge ${m.priority === "haute" ? "bg-red-100 text-red-800" : m.priority === "moyenne" ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600"}`}>{t.dev.priorities[m.priority]}</span>
              </div>
              <p className="text-sm text-stone-700">{m.why}</p>
              <ul className="mt-2 list-inside list-disc text-sm text-stone-600">{m.what.map((x) => <li key={x}>{x}</li>)}</ul>
              <p className="mt-auto pt-2 text-xs text-stone-500">{p.effort} : <strong>{p.effortLabels[m.effort]}</strong></p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {kpi(p.obtained, money(kpis.obtained), `${money(savingsPerMonth)} / ${p.month}`, true)}
          {kpi(p.pending, money(kpis.pending))}
          {kpi(p.rate, kpis.rate == null ? "—" : `${Math.round(kpis.rate * 100)} %`)}
          {kpi(p.receptions, String(kpis.receptions), `${kpis.lines} ${p.lines}`)}
          {kpi(p.anomalies, String(kpis.anomalies), `${kpis.claims} ${p.claims}`)}
          {kpi(p.priceChanges, String(kpis.priceChanges))}
          {kpi(p.sheets, String(kpis.sheets))}
          {kpi(p.users, String(kpis.users))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">{p.roiTitle}</h2>
        <p className="mb-3 text-xs text-stone-500">{p.roiHint}</p>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="grid grid-cols-2 gap-3">
            {field("monthlyCost", p.monthlyCost, "€ / " + p.month)}
            {field("hoursPerWeek", p.hoursPerWeek, "h / " + p.week)}
            {field("hourlyRate", p.hourlyRate, "€ / h")}
            {field("sites", p.sites, "")}
            <div className="col-span-2">
              <button type="button" className="btn-secondary py-1.5" disabled={pending} onClick={() => start(async () => { await saveProjectRoiAction(r); router.refresh(); })}>{t.common.save}</button>
            </div>
          </div>
          <table className="table text-sm">
            <tbody>
              <tr><td>{p.savingsMonth}</td><td className="text-right tabular-nums">{money(savingsPerMonth)}</td></tr>
              <tr><td>{p.timeMonth}</td><td className="text-right tabular-nums">{money(timePerMonth)}</td></tr>
              <tr className="font-semibold"><td>{p.gainsMonth}</td><td className="text-right tabular-nums">{money(gains)}</td></tr>
              <tr><td>{p.costMonth}</td><td className="text-right tabular-nums">− {money(r.monthlyCost)}</td></tr>
              <tr className={`font-bold ${result >= 0 ? "text-emerald-700" : "text-red-700"}`}><td>{p.resultMonth}</td><td className="text-right tabular-nums">{money(result)}</td></tr>
              <tr><td>{p.resultYear}{r.sites > 1 ? ` (${r.sites} ${p.sitesShort})` : ""}</td><td className="text-right font-semibold tabular-nums">{money(result * 12 * r.sites)}</td></tr>
              <tr><td>{p.costPerReception}</td><td className="text-right tabular-nums">{kpis.receptions ? money((r.monthlyCost * kpis.months) / kpis.receptions) : "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">{p.docTitle}</h2>
          {editing ? (
            <span className="flex gap-2">
              <button type="button" className="btn-primary py-1.5" disabled={pending} onClick={() => start(async () => { await saveProjectDocAction(html); setEditing(false); router.refresh(); })}><Icon name="check" className="h-4 w-4" /> {t.common.save}</button>
              <button type="button" className="btn-ghost py-1.5" onClick={() => { setHtml(doc); setEditing(false); }}>{t.common.cancel}</button>
            </span>
          ) : (
            <button type="button" className="btn-secondary py-1.5" onClick={() => setEditing(true)}><Icon name="edit" className="h-4 w-4" /> {t.common.edit}</button>
          )}
        </div>
        {editing ? (
          <RichEditor value={html} onChange={setHtml} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
            {toc.length > 0 && (
              <nav className="h-fit rounded-2xl border border-stone-200 bg-white p-2 lg:sticky lg:top-4">
                <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">{p.toc}</p>
                {toc.map((x, i) => (
                  <button key={i} type="button" onClick={() => goTo(i)} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-100">{x}</button>
                ))}
              </nav>
            )}
            <div ref={docRef} className="card p-5 sm:p-8 [&_h2]:scroll-mt-4"><RichView html={doc} /></div>
          </div>
        )}
      </section>
    </div>
  );
}
