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
import { CloseWeekButton, ReminderSettings } from "./CloseWeek";
import { closingReminders } from "@/lib/server/closingReminders";
import { one, type SP } from "@/lib/server/queries";

/** Anomalies > Clôture hebdo : bilan de chaque semaine et consolidation des anomalies réglées */
export default async function WeeklyClosingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const w = t.weekly;
  // Fréquence affichée : semaines ou mois
  const period: "week" | "month" = one((await searchParams).p) === "mois" ? "month" : "week";
  const reminders = await closingReminders();
  const [all, closings] = await Promise.all([
    loadAnomalies(),
    getDb().select({ c: schema.weeklyClosings, by: schema.users.name }).from(schema.weeklyClosings).leftJoin(schema.users, eq(schema.users.id, schema.weeklyClosings.closedBy)).orderBy(desc(schema.weeklyClosings.week)),
  ]);
  const closingByWeek = new Map(closings.filter((x) => x.c.period === period).map((x) => [x.c.week, x]));
  const settled = all.filter((a) => (stageOf(a.stage) === "cloturee" || stageOf(a.stage) === "annulee") && a.closedAt);
  const monthOf = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d).slice(0, 7) + "-01";
  const periodOf = (d: Date) => (period === "month" ? monthOf(d) : weekOf(d));
  const current = periodOf(new Date());
  // Périodes : les 12 dernières semaines ou les 12 derniers mois
  const weeks: string[] = [];
  for (let d = new Date(current + "T12:00:00Z"), i = 0; i < 12; i++) {
    weeks.push(d.toISOString().slice(0, 10));
    if (period === "month") d.setUTCMonth(d.getUTCMonth() - 1);
    else d.setUTCDate(d.getUTCDate() - 7);
  }
  const pendingNow = savingsOf(all).pending;
  const toConsolidate = settled.filter((a) => !a.consolidatedAt).length;

  return (
    <>
      <PageHeader title={w.title}>
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          <Link href="/anomalies/cloture" className={`rounded-md px-3 py-1.5 font-medium ${period === "week" ? "bg-brand-600 text-white" : "text-stone-600"}`}>{w.weeks}</Link>
          <Link href="/anomalies/cloture?p=mois" className={`rounded-md px-3 py-1.5 font-medium ${period === "month" ? "bg-brand-600 text-white" : "text-stone-600"}`}>{w.months}</Link>
        </div>
      </PageHeader>
      {can.consolidate(user.role) && <ReminderSettings weekly={reminders.weeklyEnabled} monthly={reminders.monthlyEnabled} />}
      {(reminders.weekDue || reminders.monthDue) && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {reminders.weekDue && <span className="mr-3">⏰ {w.weekDue}</span>}
          {reminders.monthDue && <span>⏰ {w.monthDue}</span>}
        </p>
      )}
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{w.intro}</p>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="badge bg-amber-100 text-amber-900">{w.pendingNow} : {fmtMoney(pendingNow.amount, locale)} ({pendingNow.count})</span>
        <span className="badge bg-stone-100 text-stone-700">{toConsolidate} {w.toConsolidate}</span>
      </div>
      <div className="space-y-3">
        {weeks.map((wk) => {
          const end = new Date(wk + "T00:00:00");
          if (period === "month") end.setMonth(end.getMonth() + 1);
          else end.setDate(end.getDate() + 7);
          const inWeek = settled.filter((a) => periodOf(a.closedAt!) === wk);
          const s = savingsOf(inWeek);
          const done = closingByWeek.get(wk);
          const open = settled.filter((a) => !a.consolidatedAt && a.closedAt! < end).length;
          const sunday = new Date(end.getTime() - 86_400_000);
          return (
            <details key={wk} className="card" open={wk === current}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-semibold">{period === "month" ? `${w.month} ${new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(wk + "T12:00:00"))}` : `${w.week} ${fmtDate(wk, locale)} → ${fmtDate(sunday, locale)}`}{wk === current ? ` (${w.current})` : ""}</span>
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
                {can.consolidate(user.role) && (open > 0 || !done) && <CloseWeekButton week={wk} count={open} period={period} />}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
