import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
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
  // Récap par type d'anomalie (fiches en cours) ; un clic filtre les fiches de ce type
  const typeOf = (x: (typeof active)[number]) => x.problemType || t.anomalies.types[x.type];
  const typeCounts = [...active.reduce((m, x) => m.set(typeOf(x), (m.get(typeOf(x)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
  const typeFilter = one(sp.type) ?? "";
  const shown = typeFilter ? active.filter((x) => typeOf(x) === typeFilter) : active;
  const typeHref = (ty: string) => `/anomalies?${new URLSearchParams({ ...(view === "list" ? { view: "liste" } : {}), ...(ty ? { type: ty } : {}) })}`;
  return (
    <>
      <PageHeader title={t.anomalies.title}>
        <Link href="/protocoles?id=proc-reclamation" className="btn-secondary py-1.5"><Icon name="book" className="h-4 w-4" /> {t.protocols.procedure}</Link>
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
      <details open={!!typeFilter} className="group mb-4 rounded-xl border border-stone-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span><strong>{t.anomalies.typeRecap}</strong> · {active.length} {t.anomalies.sheetsCount}{typeFilter ? ` · ${t.anomalies.filteredOn} « ${typeFilter} »` : ""}</span>
          <span className="text-stone-400 transition group-open:rotate-90">▸</span>
        </summary>
        <div className="border-t border-stone-100 p-3">
          <table className="table max-w-xl text-sm">
            <thead><tr><th>{t.sheet.problemType}</th><th className="text-right">{t.anomalies.count}</th></tr></thead>
            <tbody>
              {typeCounts.map(([ty, n]) => (
                <tr key={ty} className={ty === typeFilter ? "bg-brand-50" : ""}>
                  <td><Link href={typeHref(ty === typeFilter ? "" : ty)} className="font-medium text-brand-700 hover:underline">{ty}</Link></td>
                  <td className="text-right tabular-nums">{n}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td>{t.common.total}</td><td className="text-right tabular-nums">{active.length}</td></tr>
            </tbody>
          </table>
          {typeFilter && <Link href={typeHref("")} className="btn-ghost mt-2 text-sm">✕ {t.anomalies.clearType}</Link>}
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
