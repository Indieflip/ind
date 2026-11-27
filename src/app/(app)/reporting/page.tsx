import { PeriodParams } from "@/components/PeriodParams";
import { asc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtPct } from "@/lib/format";
import { one, type SP } from "@/lib/server/queries";
import { Field, FilterBar, PageHeader, Stat, qs } from "@/components/ui";
import Link from "next/link";
import { syncMajPrices } from "@/lib/server/priceSync";
import { loadPurchases, PURCHASE_FREQS, type PurchaseFreq } from "@/lib/server/purchases";
import { PurchasesTable } from "./PurchasesTable";

function defaultFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

export default async function ReportingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const from = one(sp.from) && /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)!) ? one(sp.from)! : defaultFrom();
  const to = one(sp.to) && /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)!) ? one(sp.to)! : new Date().toISOString().slice(0, 10);
  const start = sql`((${from}::date)::timestamp at time zone 'Europe/Paris')`;
  const end = sql`((${to}::date + 1)::timestamp at time zone 'Europe/Paris')`;
  const db = getDb();
  await syncMajPrices();

  const [kpi, anomalyKpi, priceKpi] = await Promise.all([
    db.execute<{ receptions: number; conform: number }>(sql`
      select count(*)::int as receptions, count(*) filter (where status = 'conform')::int as conform
      from receptions where kind = 'livraison' and delivered_at >= ${start} and delivered_at < ${end}`),
    db.execute<{ open: number; claimed: number; credits: string | null }>(sql`
      select count(*) filter (where status = 'open')::int as open,
             count(*) filter (where status = 'claimed')::int as claimed,
             sum(credit_amount) filter (where status = 'credit_received' and created_at >= ${start} and created_at < ${end}) as credits
      from anomalies`),
    db.execute<{ increases: number; avg: number | null; unclaimed: number }>(sql`
      select count(*) filter (where type = 'increase')::int as increases,
             avg(pct) filter (where type = 'increase') as avg,
             count(*) filter (where type = 'increase' and (claim is null or trim(claim) = ''))::int as unclaimed
      from price_changes where date >= ${start} and date < ${end}`),
  ]);

  const k = kpi.rows[0];
  const ak = anomalyKpi.rows[0];
  const pk = priceKpi.rows[0];
  const rate = k.receptions ? Math.round((k.conform / k.receptions) * 100) : null;
  // Achats par fournisseur (fréquence choisie)
  const af: PurchaseFreq = (one(sp.af) ?? "") in PURCHASE_FREQS ? (one(sp.af) as PurchaseFreq) : "mois";
  const purchases = can.viewMercurial(user.role) ? await loadPurchases(af, locale, { weekOf: t.purchases.weekOf, noSupplier: t.purchases.noSupplier }, { from: one(sp.pfrom), to: one(sp.pto) }) : null;

  return (
    <>
      <PageHeader title={t.reporting.title} />
      {/* Période (modèle commun : calendrier + périodes rapides) */}
      <div className="no-print mb-4"><PeriodParams from={from ?? ""} to={to ?? ""} /></div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t.reporting.receptions} value={k.receptions} />
        <Stat label={t.reporting.conformRate} value={rate == null ? "—" : `${rate} %`} hint={`${k.conform} / ${k.receptions}`} />
        <Stat label={t.reporting.openAnomalies} value={ak.open} hint={`${ak.claimed} ${t.anomalies.statuses.claimed.toLowerCase()}`} />
        <Stat label={t.reporting.pendingCredits} value={ak.claimed} hint={ak.credits ? `${t.anomalies.statuses.credit_received} : ${fmtMoney(ak.credits, locale)}` : undefined} />
        {can.viewPrices(user.role) ? (
          <Link href={`/reporting/prix${qs({ from, to })}`} className="block transition hover:opacity-80" title={t.reporting.seeDetail}>
            <Stat label={t.reporting.priceIncreases} value={pk.increases} hint={`${t.reporting.avgIncrease} ${fmtPct(pk.avg != null ? Math.round(pk.avg * 10) / 10 : null)} · ${pk.unclaimed} ${t.prices.unclaimed.toLowerCase()}`} />
          </Link>
        ) : (
          <Stat label={t.reporting.priceIncreases} value={pk.increases} hint={`${t.reporting.avgIncrease} ${fmtPct(pk.avg != null ? Math.round(pk.avg * 10) / 10 : null)} · ${pk.unclaimed} ${t.prices.unclaimed.toLowerCase()}`} />
        )}
      </div>

      {purchases && <PurchasesTable rows={purchases.rows} periods={purchases.periods} freq={af} freqs={Object.keys(PURCHASE_FREQS)} from={purchases.from} to={purchases.to} />}
    </>
  );
}
