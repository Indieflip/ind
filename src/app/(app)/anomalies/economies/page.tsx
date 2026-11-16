import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtMoney, sentence } from "@/lib/format";
import { isOpenStage, stageOf } from "@/lib/anomaly";
import { one, type SP } from "@/lib/server/queries";
import { loadAnomalies, savingsOf, type AnomalyLite } from "@/lib/server/savings";
import { syncWeighAnomalies } from "@/lib/server/weighAnomalies";
import { PageHeader } from "@/components/ui";

const PERIODS = ["all", "month", "lastMonth", "30d", "year"] as const;

/** Anomalies > Économies : avoirs obtenus, livraisons différées, montants en attente, par fournisseur et par mois */
export default async function SavingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const e = t.savings;
  await syncWeighAnomalies();
  const period = (PERIODS as readonly string[]).includes(one((await searchParams).p) ?? "") ? (one((await searchParams).p) as (typeof PERIODS)[number]) : "all";
  const now = new Date();
  const start =
    period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1)
    : period === "lastMonth" ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : period === "30d" ? new Date(now.getTime() - 30 * 86_400_000)
    : period === "year" ? new Date(now.getFullYear(), 0, 1)
    : null;
  const end = period === "lastMonth" ? new Date(now.getFullYear(), now.getMonth(), 1) : null;
  const all = await loadAnomalies();
  const inPeriod = (a: AnomalyLite) => (!start || a.createdAt >= start) && (!end || a.createdAt < end);
  const list = all.filter(inPeriod);
  const s = savingsOf(list);
  const money = (n: number) => fmtMoney(n, locale);

  // Par fournisseur
  const bySupplier = new Map<string, AnomalyLite[]>();
  for (const a of list) bySupplier.set(sentence(a.supplierName), [...(bySupplier.get(sentence(a.supplierName)) ?? []), a]);
  const suppliers = [...bySupplier.entries()]
    .map(([name, xs]) => {
      const v = savingsOf(xs);
      const closed = xs.filter((a) => a.closedAt && stageOf(a.stage) === "cloturee");
      const avgDays = closed.length ? Math.round(closed.reduce((d, a) => d + (a.closedAt!.getTime() - a.createdAt.getTime()) / 86_400_000, 0) / closed.length) : null;
      return { name, count: xs.length, open: xs.filter((a) => isOpenStage(stageOf(a.stage))).length, obtained: v.obtained, pending: v.pending.amount, avgDays };
    })
    .sort((a, b) => b.obtained + b.pending - (a.obtained + a.pending));

  // Par mois (date de l'anomalie)
  const byMonth = new Map<string, AnomalyLite[]>();
  for (const a of list) {
    const k = a.createdAt.toISOString().slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), a]);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, xs]) => ({ k, ...savingsOf(xs), count: xs.length }));
  const monthLabel = (k: string) => { const x = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(k + "-15")); return x.charAt(0).toUpperCase() + x.slice(1); };

  const Tile = ({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls: string }) => (
    <div className={`rounded-xl p-4 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-80">{sub}</p>}
    </div>
  );

  return (
    <>
      <PageHeader title={e.title}>
        <div className="flex flex-wrap rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={p === "all" ? "/anomalies/economies" : `/anomalies/economies?p=${p}`} className={`rounded-md px-2.5 py-1.5 font-medium ${period === p ? "bg-brand-600 text-white" : "text-stone-600"}`}>{e.periods[p]}</Link>
          ))}
        </div>
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{e.intro}</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={e.obtained} value={money(s.obtained)} sub={`${s.credits.count} ${e.credits} (${money(s.credits.amount)}) · ${s.deferred.count} ${e.deferredCount} (${money(s.deferred.amount)})`} cls="bg-emerald-50 text-emerald-900" />
        <Tile label={e.pending} value={money(s.pending.amount)} sub={`${s.pending.count} ${e.openClaims}${s.pending.withoutAmount ? ` · ${s.pending.withoutAmount} ${e.withoutAmount}` : ""}`} cls="bg-amber-50 text-amber-900" />
        <Tile label={e.toProcess} value={money(s.toProcess.amount)} sub={`${s.toProcess.count} ${e.anomalies}`} cls="bg-red-50 text-red-900" />
        <Tile label={e.rate} value={s.rate == null ? "—" : `${Math.round(s.rate * 100)} %`} sub={e.rateHint} cls="bg-white text-stone-800 ring-1 ring-stone-200" />
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="font-semibold">📞 {t.modes.reclamation}</h2>
          <p className="text-xs text-stone-500">{t.sheet.modeHints.reclamation}</p>
          <p className="mt-2 text-xl font-bold tabular-nums">{money(s.reclamation.amount)}</p>
          <p className="text-sm text-stone-600">{s.reclamation.count} {e.inWait}{s.reclamation.withoutAmount ? ` · ${s.reclamation.withoutAmount} ${e.withoutAmount}` : ""}</p>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold">🔍 {t.modes.verification}</h2>
          <p className="text-xs text-stone-500">{t.sheet.modeHints.verification}</p>
          <p className="mt-2 text-xl font-bold tabular-nums">{money(s.verification.amount)}</p>
          <p className="text-sm text-stone-600">{s.verification.count} {e.inWait}{s.verification.withoutAmount ? ` · ${s.verification.withoutAmount} ${e.withoutAmount}` : ""}</p>
        </div>
      </section>

      <section className="card mb-6 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{e.bySupplier}</h2>
        <table className="table mt-2 text-sm">
          <thead><tr><th>{t.common.supplier}</th><th className="text-right">{e.anomalies}</th><th className="text-right">{e.stillOpen}</th><th className="text-right">{e.obtained}</th><th className="text-right">{e.pending}</th><th className="text-right">{e.avgDays}</th></tr></thead>
          <tbody>
            {suppliers.map((x) => (
              <tr key={x.name}>
                <td className="font-medium">{x.name}</td>
                <td className="text-right tabular-nums">{x.count}</td>
                <td className="text-right tabular-nums">{x.open}</td>
                <td className="text-right font-semibold tabular-nums text-emerald-800">{x.obtained ? money(x.obtained) : "—"}</td>
                <td className="text-right tabular-nums text-amber-800">{x.pending ? money(x.pending) : "—"}</td>
                <td className="text-right tabular-nums">{x.avgDays != null ? `${x.avgDays} ${t.kanban.days}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{e.byMonth}</h2>
        <table className="table mt-2 text-sm">
          <thead><tr><th>{e.month}</th><th className="text-right">{e.anomalies}</th><th className="text-right">{e.obtained}</th><th className="text-right">{e.pending}</th><th className="text-right">{e.noFollow}</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.k}>
                <td className="font-medium">{monthLabel(m.k)}</td>
                <td className="text-right tabular-nums">{m.count}</td>
                <td className="text-right font-semibold tabular-nums text-emerald-800">{money(m.obtained)}</td>
                <td className="text-right tabular-nums text-amber-800">{money(m.pending.amount)}</td>
                <td className="text-right tabular-nums text-stone-600">{m.noFollow.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="mt-3 text-xs text-stone-500">{e.footnote}</p>
    </>
  );
}
