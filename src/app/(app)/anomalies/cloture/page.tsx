import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, num, sentence } from "@/lib/format";
import { stageOf } from "@/lib/anomaly";
import { loadAnomalies, savingsOf, weekOf } from "@/lib/server/savings";
import { PageHeader } from "@/components/ui";
import { CloseWeekButton } from "./CloseWeek";

/** Anomalies > Clôture hebdo : bilan de chaque semaine et consolidation des anomalies réglées */
export default async function WeeklyClosingPage() {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const w = t.weekly;
  const [all, closings] = await Promise.all([
    loadAnomalies(),
    getDb().select({ c: schema.weeklyClosings, by: schema.users.name }).from(schema.weeklyClosings).leftJoin(schema.users, eq(schema.users.id, schema.weeklyClosings.closedBy)).orderBy(desc(schema.weeklyClosings.week)),
  ]);
  const closingByWeek = new Map(closings.map((x) => [x.c.week, x]));
  const settled = all.filter((a) => (stageOf(a.stage) === "cloturee" || stageOf(a.stage) === "annulee") && a.closedAt);
  const current = weekOf(new Date());
  // Semaines : de la plus ancienne clôture à la semaine en cours (12 dernières)
  const weeks: string[] = [];
  for (let d = new Date(current + "T12:00:00Z"), i = 0; i < 12; i++, d.setUTCDate(d.getUTCDate() - 7)) weeks.push(d.toISOString().slice(0, 10));
  const pendingNow = savingsOf(all).pending;
  const toConsolidate = settled.filter((a) => !a.consolidatedAt).length;

  return (
    <>
      <PageHeader title={w.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{w.intro}</p>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="badge bg-amber-100 text-amber-900">{w.pendingNow} : {fmtMoney(pendingNow.amount, locale)} ({pendingNow.count})</span>
        <span className="badge bg-stone-100 text-stone-700">{toConsolidate} {w.toConsolidate}</span>
      </div>
      <div className="space-y-3">
        {weeks.map((wk) => {
          const end = new Date(wk + "T00:00:00");
          end.setDate(end.getDate() + 7);
          const inWeek = settled.filter((a) => weekOf(a.closedAt!) === wk);
          const s = savingsOf(inWeek);
          const done = closingByWeek.get(wk);
          const open = settled.filter((a) => !a.consolidatedAt && a.closedAt! < end).length;
          const sunday = new Date(wk + "T12:00:00Z");
          sunday.setUTCDate(sunday.getUTCDate() + 6);
          return (
            <details key={wk} className="card" open={wk === current}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-semibold">{w.week} {fmtDate(wk, locale)} → {fmtDate(sunday.toISOString().slice(0, 10), locale)}{wk === current ? ` (${w.current})` : ""}</span>
                <span className="text-sm text-stone-600">{inWeek.length} {w.settled}</span>
                <span className="text-sm font-semibold text-emerald-800">{fmtMoney(s.obtained, locale)}</span>
                {done ? (
                  <span className="badge ml-auto bg-emerald-100 text-emerald-800">✓ {w.closedOn} {fmtDateTime(done.c.closedAt, locale)}{done.by ? ` · ${done.by}` : ""}</span>
                ) : (
                  <span className="badge ml-auto bg-stone-100 text-stone-600">{w.notClosed}</span>
                )}
              </summary>
              <div className="border-t border-stone-100 px-4 py-3">
                <div className="mb-3 grid gap-2 text-sm sm:grid-cols-4">
                  <div><span className="text-stone-500">{t.resolutions.avoir}</span><p className="font-semibold">{s.credits.count} · {fmtMoney(s.credits.amount, locale)}</p></div>
                  <div><span className="text-stone-500">{t.resolutions.livraison}</span><p className="font-semibold">{s.deferred.count} · {fmtMoney(s.deferred.amount, locale)}</p></div>
                  <div><span className="text-stone-500">{t.resolutions.sans_suite}</span><p className="font-semibold">{s.noFollow.count}</p></div>
                  <div><span className="text-stone-500">{t.stages.annulee}</span><p className="font-semibold">{inWeek.filter((a) => stageOf(a.stage) === "annulee").length}</p></div>
                </div>
                {done && <p className="mb-2 text-xs text-stone-500">{w.snapshot} : {w.pendingThen} {fmtMoney(num(done.c.pending) ?? 0, locale)}</p>}
                {inWeek.length > 0 && (
                  <ul className="mb-3 divide-y divide-stone-100 text-sm">
                    {inWeek.map((a) => (
                      <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                        <Link href={`/anomalies/${a.id}`} className="text-brand-700 hover:underline">{a.number ? `N° ${a.number} · ` : ""}{sentence(a.supplierName)} — {a.productName ?? a.description.slice(0, 60)}</Link>
                        <span className="text-stone-600">{stageOf(a.stage) === "annulee" ? t.stages.annulee : a.resolution ? t.resolutions[a.resolution as "avoir"] : t.stages.cloturee}{a.credit ? ` · ${fmtMoney(a.credit, locale)}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {can.consolidate(user.role) && open > 0 && <CloseWeekButton week={wk} count={open} />}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
