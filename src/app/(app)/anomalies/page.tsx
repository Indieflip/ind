import { anomalyNumbers } from "@/lib/server/savings";
import { redirect } from "next/navigation";
import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, num } from "@/lib/format";
import { one, receptionNumbers, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { AnomaliesBoard, AnomalyForm } from "./AnomalyClient";
import { lineDocLabel } from "@/lib/documents";
import { ensureAnomaliesLinked } from "@/lib/server/maj";
import { syncWeighAnomalies } from "@/lib/server/weighAnomalies";
import { ensureClaimNumbers } from "@/lib/server/claimNumbers";
import { supplierProcesses } from "@/lib/server/followup";
import { daysSince, stageOf, isClaimMode, verificationDue } from "@/lib/anomaly";
import { DueBox, Kanban } from "./Kanban";
import Link from "next/link";
import { Icon } from "@/components/Icon";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  await ensureAnomaliesLinked();
  await syncWeighAnomalies();
  await ensureClaimNumbers();
  const processes = await supplierProcesses();
  const view = one(sp.view) === "liste" ? "list" : "board";
  // « Aller à la fiche N° » : fiche en cours ou consolidée (N° définitif ou provisoire)
  const wanted = Number(one(sp.n));
  if (Number.isInteger(wanted) && wanted > 0) {
    const nums = await anomalyNumbers();
    const hit = [...nums.entries()].find(([, v]) => v.n === wanted);
    if (hit) redirect(`/anomalies/${hit[0]}`);
  }
  const a = schema.anomalies;
  const by = alias(schema.users, "by");
  const db = getDb();
  const [active, consolidated, recent, numbers, docs] = await Promise.all([
    db.select().from(a).where(isNull(a.consolidatedAt)).orderBy(desc(a.createdAt)),
    db
      .select({ a, byName: by.name })
      .from(a)
      .leftJoin(by, eq(by.id, a.consolidatedBy))
      .where(isNotNull(a.consolidatedAt))
      .orderBy(desc(a.consolidatedAt))
      .limit(500),
    db
      .select({ id: schema.receptions.id, blNumber: schema.receptions.blNumber, supplierName: schema.receptions.supplierName, deliveredAt: schema.receptions.deliveredAt })
      .from(schema.receptions)
      .orderBy(desc(schema.receptions.deliveredAt))
      .limit(300),
    receptionNumbers(),
    // Documents des bons (type, numéro, date) et fournisseurs, pour les colonnes Fournisseur et BL / Facture
    db
      .select({ id: a.id, documents: schema.receptions.documents, blNumber: schema.receptions.blNumber, lineDoc: schema.receptionLines.document, supplier: schema.suppliers.name })
      .from(a)
      .leftJoin(schema.receptions, eq(schema.receptions.id, a.receptionId))
      .leftJoin(schema.receptionLines, eq(schema.receptionLines.id, a.lineId))
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, a.supplierId)),
  ]);
  const extra = new Map(docs.map((d) => [d.id, d]));
  // N° : définitif une fois consolidée ; avant, numéro provisoire (suite des numéros, par date)
  const maxNum = consolidated.reduce((m, c) => Math.max(m, c.a.number ?? 0), 0);
  const provisional = new Map([...active].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id - y.id).map((x, i) => [x.id, maxNum + i + 1]));
  const day = today();
  void day;
  const now = new Date();
  const toRow = (x: typeof active[number]) => ({
    id: x.id,
    number: x.number ?? provisional.get(x.id) ?? null,
    numberFinal: x.number != null,
    date: fmtDate(x.createdAt, locale),
    dateSort: x.createdAt.toISOString(),
    nature: x.nature ?? "",
    review: x.review ?? "",
    problemType: x.problemType || t.anomalies.types[x.type],
    supplier: extra.get(x.id)?.supplier ?? x.supplierName,
    supplierId: x.supplierId,
    reference: (x.receptionId ? lineDocLabel(extra.get(x.id)?.documents, extra.get(x.id)?.lineDoc, extra.get(x.id)?.blNumber) : null) ?? x.reference ?? "",
    product: x.productName ?? "",
    problem: x.description,
    action: x.followUp ?? "",
    lastActionAt: x.lastActionAt ?? "",
    result: x.result ?? "",
    saving: num(x.creditAmount),
    status: x.status,
    statusLabel: t.anomalies.statuses[x.status],
    type: t.anomalies.types[x.type],
    nextActionAt: x.nextActionAt ?? "",
    stage: x.stage,
    resolution: x.resolution,
    mode: x.mode,
    claimed: num(x.claimedAmount),
    closedAt: x.closedAt ? x.closedAt.toISOString() : null,
    days: daysSince(x.lastActionAt, x.createdAt, now),
    delay: processes.find(x.supplierId, x.supplierName)?.delay ?? 3,
    // À relancer : réclamée ou à vérifier, sans nouvelle action depuis le délai du fournisseur (3 jours par défaut)
    verify: x.consolidatedAt ? null : verificationDue(x.stage, x.mode, daysSince(x.lastActionAt, x.createdAt, now)),
    due: (stageOf(x.stage) === "reclamee" || stageOf(x.stage) === "a_verifier") && isClaimMode(x.mode) && !x.consolidatedAt && daysSince(x.lastActionAt, x.createdAt, now) >= (processes.find(x.supplierId, x.supplierName)?.delay ?? 3),
    receptionId: x.receptionId,
    photoUrl: x.photoUrl,
  });
  const preselect = Number(one(sp.reception)) || null;
  // Récap par type d'anomalie sur une période (mois, trimestre, année en cours ou dates choisies) : nombre de fiches et montant réclamé
  const typeOf = (x: (typeof active)[number]) => x.problemType || t.anomalies.types[x.type];
  const rp = ["mois", "trimestre", "annee", "perso"].includes(one(sp.rp) ?? "") ? (one(sp.rp) as "mois" | "trimestre" | "annee" | "perso") : ("mois" as "mois" | "trimestre" | "annee" | "perso");
  const nowP = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let rFrom = iso(new Date(nowP.getFullYear(), nowP.getMonth(), 1));
  let rTo = iso(new Date(nowP.getFullYear(), nowP.getMonth() + 1, 0));
  if (rp === "trimestre") { const q0 = Math.floor(nowP.getMonth() / 3) * 3; rFrom = iso(new Date(nowP.getFullYear(), q0, 1)); rTo = iso(new Date(nowP.getFullYear(), q0 + 3, 0)); }
  if (rp === "annee") { rFrom = `${nowP.getFullYear()}-01-01`; rTo = `${nowP.getFullYear()}-12-31`; }
  if (rp === "perso") { if (isDay(one(sp.rfrom))) rFrom = one(sp.rfrom)!; if (isDay(one(sp.rto))) rTo = one(sp.rto)!; if (rFrom > rTo) [rFrom, rTo] = [rTo, rFrom]; }
  const recapRows = (await getDb().execute<{ problem_type: string | null; type: string; n: number; amount: string | null }>(sql`
    select problem_type, type, count(*)::int as n, sum(claimed_amount)::text as amount
    from anomalies
    where (created_at at time zone 'Europe/Paris')::date between ${rFrom}::date and ${rTo}::date
    group by 1, 2`)).rows;
  const recapMap = new Map<string, { n: number; amount: number }>();
  for (const r of recapRows) {
    const k = r.problem_type || t.anomalies.types[r.type as "other"] || r.type;
    const e = recapMap.get(k) ?? { n: 0, amount: 0 };
    recapMap.set(k, { n: e.n + r.n, amount: e.amount + (Number(r.amount) || 0) });
  }
  const typeCounts = [...recapMap].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "fr"));
  const recapTotal = typeCounts.reduce((acc, [, v]) => ({ n: acc.n + v.n, amount: acc.amount + v.amount }), { n: 0, amount: 0 });
  const typeFilter = one(sp.type) ?? "";
  const shown = typeFilter ? active.filter((x) => typeOf(x) === typeFilter) : active;
  const recapQs = { rp, ...(rp === "perso" ? { rfrom: rFrom, rto: rTo } : {}) };
  const typeHref = (ty: string) => `/anomalies?${new URLSearchParams({ ...(view === "list" ? { view: "liste" } : {}), ...recapQs, ...(ty ? { type: ty } : {}) })}`;
  const periodHref = (p: string) => `/anomalies?${new URLSearchParams({ ...(view === "list" ? { view: "liste" } : {}), rp: p, ...(typeFilter ? { type: typeFilter } : {}) })}`;
  return (
    <>
      <PageHeader title={t.anomalies.title}>
        <form action="/anomalies" className="flex items-center gap-1">
          <input name="n" inputMode="numeric" className="input w-28 py-1.5 text-sm" placeholder={t.anomalies.goToNumber} aria-label={t.anomalies.goToNumber} />
          <button className="btn-secondary px-2 py-1.5" aria-label={t.common.search}><Icon name="search" className="h-4 w-4" /></button>
        </form>
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          <Link href="/anomalies" className={`rounded-md px-3 py-1.5 font-medium ${view === "board" ? "bg-brand-600 text-white" : "text-stone-600"}`}>{t.kanban.board}</Link>
          <Link href="/anomalies?view=liste" className={`rounded-md px-3 py-1.5 font-medium ${view === "list" ? "bg-brand-600 text-white" : "text-stone-600"}`}>{t.kanban.list}</Link>
        </div>
      </PageHeader>
      {can.createAnomaly(user.role) && (
        <AnomalyForm
          preselect={preselect}
          receptions={recent.map((r) => ({ id: r.id, label: `${numbers.get(r.id) ?? ""}. ${r.blNumber ? r.blNumber : "—"} · ${r.supplierName} · ${fmtDate(r.deliveredAt, locale)}` }))}
        />
      )}
      <DueBox rows={active.map(toRow)} />
      <details open={!!typeFilter || !!one(sp.rp)} className="group mb-4 rounded-xl border border-stone-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span><strong>{t.anomalies.typeRecap}</strong> · {recapTotal.n} {t.anomalies.sheetsLabel} · {fmtMoney(recapTotal.amount, locale)}{typeFilter ? ` · ${t.anomalies.filteredOn} « ${typeFilter} »` : ""}</span>
          <span className="text-stone-400 transition group-open:rotate-90">▸</span>
        </summary>
        <div className="space-y-3 border-t border-stone-100 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-stone-500">{t.anomalies.frequency} :</span>
            {(["mois", "trimestre", "annee", "perso"] as const).map((p) => (
              <Link key={p} href={periodHref(p)} className={`rounded-lg px-3 py-1.5 font-medium ${rp === p ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}>{t.anomalies.periods[p]}</Link>
            ))}
            {rp === "perso" && (
              <form action="/anomalies" className="flex flex-wrap items-center gap-1.5">
                {view === "list" && <input type="hidden" name="view" value="liste" />}
                <input type="hidden" name="rp" value="perso" />
                {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
                <input type="date" name="rfrom" defaultValue={rFrom} className="input w-auto py-1 text-sm" aria-label={t.common.from} />
                <span className="text-stone-400">→</span>
                <input type="date" name="rto" defaultValue={rTo} className="input w-auto py-1 text-sm" aria-label={t.common.to} />
                <button className="btn-secondary py-1 text-sm">{t.common.apply}</button>
              </form>
            )}
            <span className="text-xs text-stone-500">{fmtDate(rFrom, locale)} → {fmtDate(rTo, locale)}</span>
          </div>
          <table className="table max-w-2xl text-sm">
            <thead><tr><th>{t.sheet.problemType}</th><th className="text-right">{t.anomalies.count}</th><th className="text-right">{t.anomalies.amount}</th></tr></thead>
            <tbody>
              {typeCounts.map(([ty, v]) => (
                <tr key={ty} className={ty === typeFilter ? "bg-brand-50" : ""}>
                  <td><Link href={typeHref(ty === typeFilter ? "" : ty)} className="font-medium text-brand-700 hover:underline">{ty}</Link></td>
                  <td className="text-right tabular-nums">{v.n}</td>
                  <td className="text-right tabular-nums">{fmtMoney(v.amount, locale)}</td>
                </tr>
              ))}
              {!typeCounts.length && <tr><td colSpan={3} className="py-4 text-center text-stone-500">{t.anomalies.noneInPeriod}</td></tr>}
              <tr className="font-semibold"><td>{t.common.total}</td><td className="text-right tabular-nums">{recapTotal.n}</td><td className="text-right tabular-nums">{fmtMoney(recapTotal.amount, locale)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-stone-500">{t.anomalies.recapHint}</p>
          {typeFilter && <Link href={typeHref("")} className="btn-ghost text-sm">✕ {t.anomalies.clearType}</Link>}
        </div>
      </details>
      {view === "board" ? (
        <Kanban rows={shown.map(toRow)} canManage={can.manageAnomalies(user.role)} />
      ) : (
      <AnomaliesBoard
        rows={shown.map(toRow)}
        consolidated={consolidated.filter(({ a: x }) => !typeFilter || (x.problemType || t.anomalies.types[x.type]) === typeFilter).map(({ a: x, byName }) => ({ ...toRow(x), consolidated: `${fmtDateTime(x.consolidatedAt, locale)}${byName ? ` ${t.consolidation.by} ${byName}` : ""}` }))}
        canManage={can.manageAnomalies(user.role)}
        canConsolidate={can.consolidate(user.role)}
        today={day}
      />
      )}
    </>
  );
}
