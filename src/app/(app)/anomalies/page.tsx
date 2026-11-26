import { fmtNo, parseNo } from "@/lib/numbering";
import { throttled } from "@/lib/server/throttle";
import { linkToProducts } from "@/lib/server/productLinks";
import { anomalyNumbers } from "@/lib/server/savings";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
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
import { TypeRecap } from "./TypeRecap";
import { problemTypes } from "@/lib/server/problemTypes";
import Link from "next/link";
import { Icon } from "@/components/Icon";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  // Tâches de fond : en parallèle et au plus toutes les quelques minutes (pas à chaque ouverture)
  await Promise.all([throttled("anomalies-linked", 10 * 60_000, ensureAnomaliesLinked), throttled("weigh-anomalies", 5 * 60_000, syncWeighAnomalies)]);
  await throttled("product-links", 10 * 60_000, linkToProducts);
  const [, processes] = await Promise.all([ensureClaimNumbers(), supplierProcesses()]);
  // Menu Anomalies : la liste d'abord ; le tableau de bord en colonnes avec ?view=tableau
  const view = one(sp.view) === "tableau" ? "board" : "list";
  // « Aller à la fiche N° » : fiche en cours ou consolidée (N° définitif ou provisoire)
  // Numéro tapé « FA401 » ou « 401 » : fiche de l'année en cours en priorité, sinon la plus récente
  const wanted = parseNo(one(sp.n));
  const nums = await anomalyNumbers();
  if (wanted) {
    const hits = [...nums.entries()].filter(([, v]) => v.n === wanted).sort((x, y) => y[1].year - x[1].year);
    if (hits[0]) redirect(`/anomalies/${hits[0][0]}`);
  }
  const a = schema.anomalies;
  const db = getDb();
  const [active, recent, numbers, docs] = await Promise.all([
    db.select().from(a).orderBy(desc(a.createdAt)),
    db
      .select({ id: schema.receptions.id, blNumber: schema.receptions.blNumber, supplierName: schema.receptions.supplierName, deliveredAt: schema.receptions.deliveredAt })
      .from(schema.receptions)
      .orderBy(desc(schema.receptions.deliveredAt))
      .limit(300),
    receptionNumbers(),
    // Documents des bons (type, numéro, date) et fournisseurs, pour les colonnes Fournisseur et BL / Facture
    db
      .select({ id: a.id, documents: schema.receptions.documents, blNumber: schema.receptions.blNumber, lineDoc: schema.receptionLines.document, linePrice: schema.receptionLines.unitPrice, supplier: schema.suppliers.name })
      .from(a)
      .leftJoin(schema.receptions, eq(schema.receptions.id, a.receptionId))
      .leftJoin(schema.receptionLines, eq(schema.receptionLines.id, a.lineId))
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, a.supplierId)),
  ]);
  const extra = new Map(docs.map((d) => [d.id, d]));
  // N° : numéro attribué, sinon suite des numéros par date
  const provisional = new Map([...nums].map(([id, v]) => [id, v.n]));
  const day = today();
  void day;
  const now = new Date();
  const M = t.anomalies.missingFields;
  const missingOf = (x: typeof active[number]) => {
    const out: string[] = [];
    if (!x.supplierId) out.push(M.supplier);
    if (!x.receptionId && !(x.reference ?? "").trim()) out.push(M.reference);
    if (!x.items?.length && !(x.productName ?? "").trim()) out.push(M.product);
    else if (x.items?.some((i) => i.productId == null)) out.push(M.productLink);
    // Montant : manquant seulement si un prix est connu (sur le bon ou sur un produit de la fiche) ;
    // un bon sans prix (« Non indiqué sur le bon ») ne permet pas de chiffrer : rien à compléter
    const hasPrice = (x.lineId ? extra.get(x.id)?.linePrice != null : false) || !!x.items?.some((i) => i.price != null);
    if (x.claimedAmount == null && x.type !== "missing_bl" && (hasPrice || (!x.lineId && !x.items?.length))) out.push(M.amount);
    if (x.stage === "cloturee" && !x.resolution) out.push(M.resolution);
    if (x.resolution === "avoir") {
      if (x.creditAmount == null) out.push(M.creditAmount);
      if (!(x.creditNumber ?? "").trim()) out.push(M.creditNumber);
      if (!x.creditDate) out.push(M.creditDate);
    }
    return out;
  };
  const toRow = (x: typeof active[number]) => ({
    id: x.id,
    number: provisional.get(x.id) ?? x.number ?? null,
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
    waitingFor: x.waitingFor,
    resolution: x.resolution,
    mode: x.mode,
    claimed: num(x.claimedAmount),
    closedAt: x.closedAt ? x.closedAt.toISOString() : null,
    days: daysSince(x.lastActionAt, x.createdAt, now),
    delay: processes.find(x.supplierId, x.supplierName)?.delay ?? 3,
    // À relancer : réclamée ou à vérifier, sans nouvelle action depuis le délai du fournisseur (3 jours par défaut)
    verify: verificationDue(x.stage, x.mode, daysSince(x.lastActionAt, x.createdAt, now)),
    due: stageOf(x.stage) === "en_attente" && isClaimMode(x.mode) && daysSince(x.lastActionAt, x.createdAt, now) >= (processes.find(x.supplierId, x.supplierName)?.delay ?? 3),
    receptionId: x.receptionId,
    photoUrl: x.photoUrl,
    // Champs non remplis sur la fiche (colonne « À compléter »)
    missing: missingOf(x),
  });
  const preselect = Number(one(sp.reception)) || null;
  // Récap par type d'anomalie sur une période (mois, trimestre, année en cours ou dates choisies) : nombre de fiches et montant réclamé
  const typeOf = (x: (typeof active)[number]) => x.problemType || t.anomalies.types[x.type];
  const parisDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  // (type « Quantité » supprimé : remplacé par « Quantité produit »)
  const allTypes = await problemTypes(Object.entries(t.anomalies.types).filter(([k]) => k !== "quantity").map(([, v]) => v));
  const recapItems = active.map((x) => ({ d: parisDay(x.createdAt), k: typeOf(x), amt: num(x.claimedAmount) ?? 0 }));
  const typeFilter = one(sp.type) ?? "";
  const shown = typeFilter ? active.filter((x) => typeOf(x) === typeFilter) : active;
  return (
    <>
      <PageHeader title={t.anomalies.title}>
        <form action="/anomalies" className="flex items-center gap-1">
          <input name="n" inputMode="numeric" className="input w-28 py-1.5 text-sm" placeholder={t.anomalies.goToNumber} aria-label={t.anomalies.goToNumber} />
          <button className="btn-secondary px-2 py-1.5" aria-label={t.common.search}><Icon name="search" className="h-4 w-4" /></button>
        </form>
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          <Link href="/anomalies?view=tableau" className={`rounded-md px-3 py-1.5 font-medium ${view === "board" ? "bg-brand-600 text-white" : "text-stone-600"}`}>{t.kanban.board}</Link>
          <Link href="/anomalies" className={`rounded-md px-3 py-1.5 font-medium ${view === "list" ? "bg-brand-600 text-white" : "text-stone-600"}`}>{t.kanban.list}</Link>
        </div>
      </PageHeader>
      {can.createAnomaly(user.role) && (
        <AnomalyForm
          preselect={preselect}
          receptions={recent.map((r) => ({ id: r.id, label: `${numbers.get(r.id) ?? ""}. ${r.blNumber ? r.blNumber : "—"} · ${r.supplierName} · ${fmtDate(r.deliveredAt, locale)}` }))}
        />
      )}
      <DueBox rows={active.map(toRow)} />
      <TypeRecap items={recapItems} types={allTypes} today={parisDay(new Date())} typeFilter={typeFilter} baseQs={view === "board" ? { view: "tableau" } : {}} initialOpen={!!typeFilter} />
      {view === "board" ? (
        <Kanban rows={shown.map(toRow)} canManage={can.manageAnomalies(user.role)} />
      ) : (
      <AnomaliesBoard
        rows={shown.map(toRow)}
        consolidated={[]}
        canManage={can.manageAnomalies(user.role)}
        canConsolidate={false}
        today={day}
      />
      )}
    </>
  );
}
