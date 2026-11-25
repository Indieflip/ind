import Link from "next/link";
import { throttled } from "@/lib/server/throttle";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtMoney, sentence } from "@/lib/format";
import { isClaimMode, isOpenStage, stageOf } from "@/lib/anomaly";
import { one, type SP } from "@/lib/server/queries";
import { loadAnomalies, savingKindOf, savingsOf, type AnomalyLite, type SavingKind } from "@/lib/server/savings";
import { syncWeighAnomalies } from "@/lib/server/weighAnomalies";
import { ensureAnomaliesLinked } from "@/lib/server/maj";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AmountTile, Justified, RecapTable, SupplierSavings, type Contribution, type RecapLine } from "./SavingsClient";

const PERIODS = ["all", "month", "lastMonth", "30d", "year"] as const;

/** Anomalies > Économies : avoirs obtenus, livraisons différées, montants en attente, par fournisseur et par mois */
export default async function SavingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const e = t.savings;
  await Promise.all([throttled("weigh-anomalies", 5 * 60_000, syncWeighAnomalies), throttled("anomalies-linked", 10 * 60_000, ensureAnomaliesLinked)]);
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

  // D'où viennent les montants : chaque anomalie qui compte, avec son N° de fiche
  const contrib = (a: AnomalyLite, kind: "credit" | "claimed"): Contribution => ({
    id: a.id, number: a.claimNo ?? a.displayNumber, final: a.numberFinal, closed: !isOpenStage(stageOf(a.stage)), date: fmtDate(a.createdAt, locale), supplier: a.supplier ?? a.supplierName,
    product: a.productName ?? a.description.slice(0, 60), stage: a.stage, resolution: a.resolution, amount: kind === "credit" ? a.credit ?? 0 : a.claimed ?? 0, kind,
  });
  // Mêmes règles que le calcul : avoirs obtenus AVEC réclamation ; quantités en trop hors statistiques
  const counted = (a: AnomalyLite) => !a.informative;
  const obtainedItems = (xs: AnomalyLite[]) => [
    ...xs.filter((a) => counted(a) && isClaimMode(a.mode) && (a.credit ?? 0) > 0 && a.resolution !== "sans_suite").map((a) => contrib(a, "credit")),
    ...xs.filter((a) => counted(a) && isClaimMode(a.mode) && stageOf(a.stage) === "cloturee" && (a.resolution === "livraison" || a.resolution === "retour") && !(a.credit ?? 0) && (a.claimed ?? 0) > 0).map((a) => contrib(a, "claimed")),
  ];
  const pendingItems = (xs: AnomalyLite[]) => xs.filter((a) => counted(a) && isClaimMode(a.mode) && (stageOf(a.stage) === "reclamee" || stageOf(a.stage) === "a_verifier") && (a.claimed ?? 0) > 0).map((a) => contrib(a, "claimed"));
  const todoItems = list.filter((a) => counted(a) && stageOf(a.stage) === "a_traiter" && (a.claimed ?? 0) > 0).map((a) => contrib(a, "claimed"));
  const verifiedItems = list.filter((a) => counted(a) && !isClaimMode(a.mode) && (a.credit ?? 0) > 0 && a.resolution !== "sans_suite").map((a) => contrib(a, "credit"));
  const extraItems = list.filter((a) => a.informative).map((a) => contrib(a, "claimed"));

  // Par fournisseur : regroupé par compte fournisseur (les fautes d'orthographe rattachées au même compte), sinon par nom écrit
  const bySupplier = new Map<string, AnomalyLite[]>();
  for (const a of list) {
    const key = a.supplierId ? `id:${a.supplierId}` : `name:${a.supplierName}`;
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), a]);
  }
  const suppliers = [...bySupplier.entries()].map(([key, xs]) => {
    const v = savingsOf(xs);
    const closed = xs.filter((a) => a.closedAt && stageOf(a.stage) === "cloturee");
    const avgDays = closed.length ? Math.round(closed.reduce((d, a) => d + (a.closedAt!.getTime() - a.createdAt.getTime()) / 86_400_000, 0) / closed.length) : null;
    return {
      key, supplierId: xs[0].supplierId, name: xs[0].supplier ?? xs[0].supplierName, count: xs.length, open: xs.filter((a) => isOpenStage(stageOf(a.stage))).length,
      obtained: v.obtained, pending: v.pending.amount, avgDays, items: [...obtainedItems(xs), ...pendingItems(xs)],
    };
  });
  const supplierList = await getDb().select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name));

  // Par mois (date de l'anomalie)
  const byMonth = new Map<string, AnomalyLite[]>();
  for (const a of list) {
    const k = a.createdAt.toISOString().slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), a]);
  }
  // Récapitulatif fournisseur × mois
  const recapMonths = [...byMonth.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 6);
  const recap = suppliers
    .map((r) => {
      const all = bySupplier.get(r.key) ?? [];
      const bm = new Map<string, AnomalyLite[]>();
      for (const a of all) { const k = a.createdAt.toISOString().slice(0, 7); bm.set(k, [...(bm.get(k) ?? []), a]); }
      return { key: r.key, supplierId: r.supplierId, name: r.name, all, byMonth: bm };
    })
    .sort((a, b) => b.all.length - a.all.length);
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, xs]) => ({ k, ...savingsOf(xs), count: xs.length }));
  const monthLabel = (k: string) => { const x = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(k + "-15")); return x.charAt(0).toUpperCase() + x.slice(1); };


  const recapLines: RecapLine[] = recap.flatMap((r) =>
    [...r.byMonth.entries()].map(([m, xs]) => {
      const v = savingsOf(xs);
      return {
        key: `${r.key}|${m}`, supplierId: r.supplierId, name: r.name, month: monthLabel(m), monthSort: m, count: xs.length,
        closed: xs.filter((a) => !isOpenStage(stageOf(a.stage))).length, obtained: v.obtained, pending: v.pending.amount,
        items: xs.map((a) => contrib(a, (a.credit ?? 0) > 0 ? "credit" : "claimed")),
      };
    }),
  );
  return (
    <>
      <PageHeader title={e.title}>
        <div className="flex flex-wrap rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={p === "all" ? "/reporting/economies" : `/reporting/economies?p=${p}`} className={`rounded-md px-2.5 py-1.5 font-medium ${period === p ? "bg-brand-600 text-white" : "text-stone-600"}`}>{e.periods[p]}</Link>
          ))}
        </div>
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{e.intro}</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AmountTile title={e.obtained} items={obtainedItems(list)} label={e.obtained} value={money(s.obtained)} sub={`${s.credits.count} ${e.credits} (${money(s.credits.amount)}) · ${s.deferred.count} ${e.deferredCount} (${money(s.deferred.amount)})`} cls="bg-emerald-50 text-emerald-900" />
        <AmountTile title={e.pending} items={pendingItems(list)} label={e.pending} value={money(s.pending.amount)} sub={`${s.pending.count} ${e.openClaims}${s.pending.withoutAmount ? ` · ${s.pending.withoutAmount} ${e.withoutAmount}` : ""}`} cls="bg-amber-50 text-amber-900" />
        <AmountTile title={e.toProcess} items={todoItems} label={e.toProcess} value={money(s.toProcess.amount)} sub={`${s.toProcess.count} ${e.anomalies}`} cls="bg-red-50 text-red-900" />
        <div className="rounded-xl bg-white p-4 text-stone-800 ring-1 ring-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{e.rate}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{s.rate == null ? "—" : `${Math.round(s.rate * 100)} %`}</p>
          <p className="mt-0.5 text-xs opacity-80">{e.rateHint}</p>
          {s.pending.withoutAmount + s.toProcess.count > 0 && <Link href="/anomalies/reclamations?f=sans-montant" className="mt-1 block text-[11px] font-semibold text-red-700 underline">{e.fillMissing}</Link>}
        </div>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="font-semibold">📞 {t.savings.withClaim}</h2>
          <p className="text-xs text-stone-500">{t.modes.reclamation} + {t.modes.verification_reclamation}</p>
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

      {/* Types d'économies : quantités, prix, qualité, autres — chaque chiffre justifié */}
      <section className="card mb-6 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{e.byKind}</h2>
        <p className="px-4 text-xs text-stone-500">{e.byKindHint}</p>
        <table className="table mt-2 text-sm">
          <thead><tr><th>{e.kind}</th><th className="text-right">{e.anomalies}</th><th className="text-right">{e.creditsCol}</th><th className="text-right">{e.deferredCol}</th><th className="text-right">{e.obtained}</th><th className="text-right">{e.pending}</th></tr></thead>
          <tbody>
            {(["quantite", "prix", "qualite", "autre"] as SavingKind[]).map((k) => {
              const xs = list.filter((a) => savingKindOf(a.type) === k);
              const v = savingsOf(xs);
              const credits = xs.filter((a) => !a.informative && isClaimMode(a.mode) && (a.credit ?? 0) > 0 && a.resolution !== "sans_suite").map((a) => contrib(a, "credit"));
              const deferred = xs.filter((a) => !a.informative && isClaimMode(a.mode) && stageOf(a.stage) === "cloturee" && (a.resolution === "livraison" || a.resolution === "retour") && (a.claimed ?? 0) > 0).map((a) => contrib(a, "claimed"));
              const label = e.kinds[k];
              return (
                <tr key={k}>
                  <td><p className="font-medium">{label}</p><p className="text-xs text-stone-500">{e.kindTypes[k]}</p></td>
                  <td className="text-right tabular-nums"><Justified title={`${label} · ${e.anomalies}`} items={xs.map((a) => contrib(a, (a.credit ?? 0) > 0 ? "credit" : "claimed"))}>{xs.length}</Justified></td>
                  <td className="text-right tabular-nums"><Justified title={`${label} · ${e.creditsCol}`} items={credits}>{money(v.credits.amount)}</Justified></td>
                  <td className="text-right tabular-nums"><Justified title={`${label} · ${e.deferredCol}`} items={deferred}>{money(v.deferred.amount)}</Justified></td>
                  <td className="text-right font-semibold tabular-nums text-emerald-800"><Justified title={`${label} · ${e.obtained}`} items={obtainedItems(xs)}>{money(v.obtained)}</Justified></td>
                  <td className="text-right tabular-nums text-amber-800"><Justified title={`${label} · ${e.pending}`} items={pendingItems(xs)}>{money(v.pending.amount)}</Justified></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="card p-4 text-sm">
          <h2 className="font-semibold">ℹ {e.verifiedTitle}</h2>
          <p className="text-xs text-stone-500">{e.verifiedHint}</p>
          <p className="mt-1"><Justified title={e.verifiedTitle} items={verifiedItems}>{s.verifiedCredits.count} · {money(s.verifiedCredits.amount)}</Justified></p>
        </div>
        <div className="card p-4 text-sm">
          <h2 className="font-semibold">ℹ {e.extraTitle}</h2>
          <p className="text-xs text-stone-500">{e.extraHint}</p>
          <p className="mt-1"><Justified title={e.extraTitle} items={extraItems}>{s.extra.count} · {money(s.extra.amount)}</Justified></p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">{e.bySupplier}</h2>
        <SupplierSavings rows={suppliers} suppliers={supplierList} canManage={can.manageAnomalies(user.role)} />
      </section>

      {/* Récapitulatif : une ligne par fournisseur et par mois (clôturées ou non), filtres et bouton Détail */}
      <section className="mb-6">
        <h2 className="font-semibold">{e.recap}</h2>
        <p className="mb-2 text-xs text-stone-500">{e.recapHint}</p>
        <RecapTable rows={recapLines} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{e.byMonth}</h2>
        <table className="table mt-2 text-sm">
          <thead><tr><th>{e.month}</th><th className="text-right">{e.anomalies}</th><th className="text-right">{e.closedCol}</th><th className="text-right">{e.obtained}</th><th className="text-right">{e.pending}</th><th className="text-right">{e.noFollow}</th></tr></thead>
          <tbody>
            {months.map((m) => {
              const xs = byMonth.get(m.k) ?? [];
              const label = monthLabel(m.k);
              return (
                <tr key={m.k}>
                  <td className="font-medium">{label}</td>
                  <td className="text-right tabular-nums"><Justified title={`${label} · ${e.anomalies}`} items={xs.map((a) => contrib(a, (a.credit ?? 0) > 0 ? "credit" : "claimed"))}>{m.count}</Justified></td>
                  <td className="text-right tabular-nums"><Justified title={`${label} · ${e.closedCol}`} items={xs.filter((a) => !isOpenStage(stageOf(a.stage))).map((a) => contrib(a, (a.credit ?? 0) > 0 ? "credit" : "claimed"))}>{xs.filter((a) => !isOpenStage(stageOf(a.stage))).length}</Justified></td>
                  <td className="text-right font-semibold tabular-nums text-emerald-800"><Justified title={`${label} · ${e.obtained}`} items={obtainedItems(xs)}>{money(m.obtained)}</Justified></td>
                  <td className="text-right tabular-nums text-amber-800"><Justified title={`${label} · ${e.pending}`} items={pendingItems(xs)}>{money(m.pending.amount)}</Justified></td>
                  <td className="text-right tabular-nums text-stone-600">{m.noFollow.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="mt-3 text-xs text-stone-500">{e.footnote}</p>
    </>
  );
}
