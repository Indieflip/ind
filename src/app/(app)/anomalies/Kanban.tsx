"use client";
import { appAlert } from "@/components/Confirm";
import { fmtNo } from "@/lib/numbering";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { moveAnomalyAction } from "@/lib/actions/anomalies";
import { waitingOf, waitingText, stageOf, stageStyles, type Stage, modeIcon } from "@/lib/anomaly";
import { useI18n } from "@/lib/i18n/client";
import { fmtMoney, sentence } from "@/lib/format";
import type { AnomalyRow } from "./AnomalyClient";

const COLUMNS: Stage[] = ["a_traiter", "en_attente", "cloturee"];
const NEXT: Partial<Record<Stage, Stage>> = { a_traiter: "en_attente", en_attente: "cloturee" };
const PREV: Partial<Record<Stage, Stage>> = { en_attente: "a_traiter", cloturee: "en_attente" };

/** Rappel du jour : réclamations sans nouvelle depuis le délai du fournisseur, et anomalies à traiter */
export function DueBox({ rows }: { rows: AnomalyRow[] }) {
  const { t } = useI18n();
  const a = t.anomalies;
  const k = t.kanban;
  const late = rows.filter((r) => r.due);
  const todo = rows.filter((r) => stageOf(r.stage) === "a_traiter");
  const verify = rows.filter((r) => r.verify).sort((x, y) => y.days - x.days);
  // Refermable (✕) : caché jusqu'au lendemain ou jusqu'à ce que le nombre change
  const stamp = `${new Date().toISOString().slice(0, 10)}|${late.length}|${todo.length}|${verify.length}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem("rm_notice_duebox") === stamp); } catch { setHidden(false); } }, [stamp]);
  if (hidden) return null;
  return (
    <section className={`relative mb-4 rounded-xl border p-4 ${late.length ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
      <button type="button" aria-label={t.common.close} title={t.common.close} className="absolute right-2 top-2 rounded px-2 py-0.5 text-base leading-none opacity-60 hover:bg-black/5 hover:opacity-100" onClick={() => { try { localStorage.setItem("rm_notice_duebox", stamp); } catch { /* */ } setHidden(true); }}>✕</button>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pr-8">
        <h2 className={`font-semibold ${late.length ? "text-red-800" : "text-emerald-800"}`}>{a.dueToday} ({late.length})</h2>
        <span className="text-sm text-stone-700">{todo.length} {k.toProcess}</span>
      </div>
      {late.length === 0 ? (
        <p className="text-sm text-emerald-800">{k.nothingLate}</p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
          {late.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="badge bg-red-100 text-red-800">{r.days} {k.days}</span>
              <strong>{sentence(r.supplier)}</strong> · {r.product || r.problem}
              <span className="text-xs text-stone-500">({k.delay} {r.delay} {k.days})</span>
              <Link className="ml-auto text-xs font-semibold text-red-800 underline" href={`/anomalies/${r.id}`}>{a.followUpNow}</Link>
            </li>
          ))}
        </ul>
      )}
      {verify.length > 0 && (
        <div className="mt-3 border-t border-black/10 pt-3">
          <h3 className="text-sm font-semibold text-sky-900">{k.verifyTitle} ({verify.length})</h3>
          <p className="text-xs text-stone-600">{k.verifyHint}</p>
          <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto text-sm">
            {verify.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="badge bg-sky-100 text-sky-800">{r.days} {k.days}</span>
                <span className="badge bg-stone-100 text-stone-700">{r.verify === "en_attente" ? k.verifyCheck : k.verifyTodo}</span>
                <strong>{sentence(r.supplier)}</strong> · {r.product || r.problem}
                <Link className="ml-auto text-xs font-semibold text-sky-800 underline" href={`/anomalies/${r.id}`}>{k.verifyOpen}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Tableau de bord : une colonne par étape, une carte par anomalie */
export function Kanban({ rows, canManage }: { rows: AnomalyRow[]; canManage: boolean }) {
  const { t, locale } = useI18n();
  const k = t.kanban;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState<number | null>(null);
  // Tri de chaque colonne : par ancienneté (défaut), puis fournisseur A → Z, puis Z → A
  const [order, setOrder] = useState<Record<string, "days" | "az" | "za">>({});
  const nextOrder = { days: "az", az: "za", za: "days" } as const;
  // Clôture « Avoir reçu » : on ouvre la fiche pour saisir le montant, le n° et la date de l'avoir
  const move = (id: number, stage: Stage, resolution?: string) =>
    start(async () => {
      try {
        await moveAnomalyAction(id, stage, resolution);
        setClosing(null);
        if (resolution === "avoir") router.push(`/anomalies/${id}#avoir`);
        else router.refresh();
      } catch { await appAlert(t.sheet.saveFailed); }
    });
  // Clôturées : seulement les 7 derniers jours (le reste est dans la vue liste et la clôture hebdo)
  const weekAgo = Date.now() - 7 * 86_400_000;
  const inCol = (s: Stage) =>
    rows
      .filter((r) => stageOf(r.stage) === s && (s !== "cloturee" || (r.closedAt ? new Date(r.closedAt).getTime() >= weekAgo : false)))
      .sort((x, y) => {
        const o = order[s] ?? "days";
        if (o !== "days") return (o === "az" ? 1 : -1) * sentence(x.supplier).localeCompare(sentence(y.supplier), "fr", { sensitivity: "base" });
        return s === "cloturee" ? 0 : y.days - x.days;
      });
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((s) => {
        const list = inCol(s);
        const total = list.reduce((sum, r) => sum + (s === "cloturee" ? r.saving ?? 0 : r.claimed ?? 0), 0);
        return (
          <section key={s} className="flex min-h-40 flex-col rounded-xl border border-stone-200 bg-stone-100/70">
            <header className="flex items-center justify-between gap-2 rounded-t-xl px-3 py-2">
              <span className={`badge ${stageStyles[s]}`}>{t.stages[s]}</span>
              <span className="flex items-center gap-1.5 text-xs text-stone-600">
                {list.length} · {fmtMoney(total, locale)}
                <button type="button" className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${(order[s] ?? "days") === "days" ? "text-stone-400 hover:bg-white" : "bg-white text-brand-700"}`} title={k.sortHint} onClick={() => setOrder({ ...order, [s]: nextOrder[order[s] ?? "days"] })}>
                  {(order[s] ?? "days") === "az" ? "▲" : (order[s] ?? "days") === "za" ? "▼" : "▲▼"}
                </button>
              </span>
            </header>
            <ul className="max-h-[70vh] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {list.length === 0 && <li className="px-2 py-6 text-center text-xs text-stone-400">{k.empty}</li>}
              {list.map((r) => (
                <li key={r.id} className={`rounded-lg border bg-white p-2.5 text-sm shadow-sm ${r.due ? "border-red-300" : "border-stone-200"}`}>
                  <Link href={`/anomalies/${r.id}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs ${r.numberFinal ? "font-semibold text-stone-700" : "italic text-stone-400"}`}>{fmtNo("anomaly", r.number)}</span>
                      {s !== "cloturee" && (
                        <span className={`badge ${r.due ? "bg-red-100 text-red-800" : "bg-stone-100 text-stone-600"}`} title={k.sinceLast}>{r.days} {k.days}</span>
                      )}
                      {s === "cloturee" && r.resolution && <span className="badge bg-emerald-50 text-emerald-800">{t.resolutions[r.resolution as "avoir"]}</span>}
                    </div>
                    <p className="mt-0.5 font-semibold leading-tight">{sentence(r.supplier)}</p>
                    {s === "en_attente" && waitingOf(r.waitingFor) && <p className="text-[11px] font-semibold text-amber-800">{t.waiting.label} : {waitingText(r.waitingFor, t.waiting)}</p>}
                    <p className="text-xs text-stone-600">{r.product || r.type}</p>
                    {r.review && <span className={`mt-1 inline-block rounded-full border px-1.5 text-[10px] font-semibold ${r.review === "verifiee" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : r.review === "a_voir" ? "border-sky-300 bg-sky-50 text-sky-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{t.sheet.reviews[r.review as "a_verifier"]}</span>}
                    <p className="mt-1 line-clamp-2 text-xs text-stone-500">{r.problem}</p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span title={t.modes[r.mode as "reclamation"]}>{modeIcon(r.mode)} {t.modes[r.mode as "reclamation"]}</span>
                      <span className="font-semibold tabular-nums">{s === "cloturee" ? (r.saving != null ? fmtMoney(r.saving, locale) : "") : r.claimed != null ? fmtMoney(r.claimed, locale) : ""}</span>
                    </div>
                  </Link>
                  {canManage && (
                    <div className="mt-2 flex items-center gap-1 border-t border-stone-100 pt-1.5">
                      {PREV[s] && <button type="button" disabled={pending} className="btn-ghost px-1.5 py-0.5 text-xs" title={t.stages[PREV[s]!]} onClick={() => move(r.id, PREV[s]!)}>←</button>}
                      {NEXT[s] && NEXT[s] !== "cloturee" && (
                        <button type="button" disabled={pending} className="btn-ghost ml-auto px-1.5 py-0.5 text-xs text-brand-700" onClick={() => move(r.id, NEXT[s]!)}>{t.stages[NEXT[s]!]} →</button>
                      )}
                      {NEXT[s] === "cloturee" && closing !== r.id && (
                        <button type="button" disabled={pending} className="btn-ghost ml-auto px-1.5 py-0.5 text-xs text-emerald-700" onClick={() => setClosing(r.id)}>{k.close} →</button>
                      )}
                      {s !== "cloturee" && s !== "a_traiter" && closing !== r.id && NEXT[s] !== "cloturee" && (
                        <button type="button" disabled={pending} className="btn-ghost px-1.5 py-0.5 text-xs text-emerald-700" onClick={() => setClosing(r.id)}>✓</button>
                      )}
                    </div>
                  )}
                  {closing === r.id && (
                    <div className="mt-1.5 space-y-1 rounded-md bg-emerald-50 p-1.5">
                      <p className="text-[11px] font-semibold text-emerald-900">{k.howResolved}</p>
                      <div className="flex flex-wrap gap-1">
                        {(["avoir", "livraison", "retour", "sans_suite"] as const).map((res) => (
                          <button key={res} type="button" disabled={pending} className="rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100" onClick={() => move(r.id, "cloturee", res)}>{t.resolutions[res]}</button>
                        ))}
                        <button type="button" className="px-1 text-[11px] text-stone-500" onClick={() => setClosing(null)}>✕</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
