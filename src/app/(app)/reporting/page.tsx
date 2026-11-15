import { asc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtPct } from "@/lib/format";
import { one, type SP } from "@/lib/server/queries";
import { Field, FilterBar, PageHeader, Stat, qs } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MonthlyBars } from "./MonthlyBars";
import { MajLog } from "./MajLog";
import { SupplierStats } from "./SupplierStats";

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

  const majRows = await getDb().select().from(schema.majLog).orderBy(asc(schema.majLog.position));
  const [kpi, anomalyKpi, priceKpi, bySupplier, monthly] = await Promise.all([
    db.execute<{ receptions: number; conform: number }>(sql`
      select count(*)::int as receptions, count(*) filter (where status = 'conform')::int as conform
      from receptions where delivered_at >= ${start} and delivered_at < ${end}`),
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
    db.execute<{
      supplier: string; receptions: number; lines: number; conform: number; reserves: number; refusals: number;
      anomalies: number; increases: number; avg_increase: number | null;
    }>(sql`
      with r as (select * from receptions where delivered_at >= ${start} and delivered_at < ${end}),
      l as (select l.*, r.supplier_name from reception_lines l join r on r.id = l.reception_id),
      a as (select supplier_name, count(*)::int n from anomalies where created_at >= ${start} and created_at < ${end} group by supplier_name),
      p as (select supplier_name, count(*)::int n, avg(pct) av from price_changes where type = 'increase' and date >= ${start} and date < ${end} group by supplier_name),
      names as (select supplier_name from r union select supplier_name from a union select supplier_name from p)
      select n.supplier_name as supplier,
        (select count(*)::int from r where r.supplier_name = n.supplier_name) as receptions,
        (select count(*)::int from l where l.supplier_name = n.supplier_name) as lines,
        (select count(*)::int from l where l.supplier_name = n.supplier_name and decision = 'conform') as conform,
        (select count(*)::int from l where l.supplier_name = n.supplier_name and decision = 'reserve') as reserves,
        (select count(*)::int from l where l.supplier_name = n.supplier_name and decision = 'refuse') as refusals,
        coalesce(a.n, 0) as anomalies, coalesce(p.n, 0) as increases, p.av as avg_increase
      from names n left join a on a.supplier_name = n.supplier_name left join p on p.supplier_name = n.supplier_name
      order by receptions desc, supplier`),
    db.execute<{ month: string; increases: number; decreases: number }>(sql`
      select to_char(m, 'YYYY-MM') as month,
        (select count(*)::int from price_changes where type = 'increase' and date_trunc('month', date at time zone 'Europe/Paris') = m) as increases,
        (select count(*)::int from price_changes where type = 'decrease' and date_trunc('month', date at time zone 'Europe/Paris') = m) as decreases
      from generate_series(date_trunc('month', now() at time zone 'Europe/Paris') - interval '11 months', date_trunc('month', now() at time zone 'Europe/Paris'), interval '1 month') m
      order by m`),
  ]);

  const k = kpi.rows[0];
  const ak = anomalyKpi.rows[0];
  const pk = priceKpi.rows[0];
  const rate = k.receptions ? Math.round((k.conform / k.receptions) * 100) : null;
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "short" }).format(new Date(m + "-15"));

  return (
    <>
      <PageHeader title={t.reporting.title}>
        <a className="btn-secondary" href={`/api/export/receptions${qs({ from, to })}`}><Icon name="download" className="h-4 w-4" /> {t.reporting.exportHaccp}</a>
      </PageHeader>
      <FilterBar applyLabel={t.common.apply} resetHref="/reporting" resetLabel={t.common.reset}>
        <Field label={t.common.from}><input type="date" name="from" defaultValue={from} className="input py-2" /></Field>
        <Field label={t.common.to}><input type="date" name="to" defaultValue={to} className="input py-2" /></Field>
      </FilterBar>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t.reporting.receptions} value={k.receptions} />
        <Stat label={t.reporting.conformRate} value={rate == null ? "—" : `${rate} %`} hint={`${k.conform} / ${k.receptions}`} />
        <Stat label={t.reporting.openAnomalies} value={ak.open} hint={`${ak.claimed} ${t.anomalies.statuses.claimed.toLowerCase()}`} />
        <Stat label={t.reporting.pendingCredits} value={ak.claimed} hint={ak.credits ? `${t.anomalies.statuses.credit_received} : ${fmtMoney(ak.credits, locale)}` : undefined} />
        <Stat label={t.reporting.priceIncreases} value={pk.increases} hint={`${t.reporting.avgIncrease} ${fmtPct(pk.avg != null ? Math.round(pk.avg * 10) / 10 : null)} · ${pk.unclaimed} ${t.prices.unclaimed.toLowerCase()}`} />
      </div>

      <section className="card mb-6 p-4">
        <h2 className="mb-1 font-semibold">{t.reporting.priceTrend}</h2>
        <MonthlyBars
          data={monthly.rows.map((r) => ({ label: monthLabel(r.month), a: r.increases, b: r.decreases }))}
          aLabel={t.reporting.increases}
          bLabel={t.reporting.decreases}
        />
      </section>

      <section className="card mb-6 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{t.reporting.bySupplier}</h2>
        <div className="pt-2">
          <SupplierStats
            rows={bySupplier.rows.map((r) => ({
              supplier: r.supplier, receptions: r.receptions, lines: r.lines,
              pct: r.lines ? Math.round((r.conform / r.lines) * 100) : null, conform: r.conform,
              reserves: r.reserves, refusals: r.refusals, anomalies: r.anomalies, increases: r.increases,
              avg: r.avg_increase != null ? Math.round(r.avg_increase * 10) / 10 : null,
            }))}
          />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">{t.reporting.haccp}</h2>
        <p className="mt-1 text-sm text-stone-600">{t.reporting.haccpHint}</p>
        <a className="btn-primary mt-3" href={`/api/export/receptions${qs({ from, to })}`}><Icon name="download" className="h-4 w-4" /> {t.reporting.exportHaccp}</a>
      </section>
      <MajLog rows={majRows.map((r) => ({ id: r.id, date: r.date, nature: r.nature, item: r.item, detail: r.detail, reference: r.reference, claim: r.claim }))} editable={can.editPrices(user.role)} />
    </>
  );
}
