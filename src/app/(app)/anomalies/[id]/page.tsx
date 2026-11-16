import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, lt, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, num, sentence } from "@/lib/format";
import { lineDocLabel } from "@/lib/documents";
import { receptionNumbers } from "@/lib/server/queries";
import { decisionStyles } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { claimStyles } from "@/lib/anomaly";
import { AnomalySheetForm } from "./SheetClient";
import { supplierProcesses } from "@/lib/server/followup";

/** Fiche d'anomalie : la réception d'origine et tout le suivi (problème, action, résultat, économie, statut) */
export default async function AnomalySheet({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const a = await db.query.anomalies.findFirst({ where: eq(schema.anomalies.id, id) });
  if (!a) notFound();
  const [rec, line, supplier, claims, photos, numbers, maxNum, rank, author] = await Promise.all([
    a.receptionId ? db.query.receptions.findFirst({ where: eq(schema.receptions.id, a.receptionId) }) : undefined,
    a.lineId ? db.query.receptionLines.findFirst({ where: eq(schema.receptionLines.id, a.lineId) }) : undefined,
    a.supplierId ? db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, a.supplierId), columns: { id: true, name: true, email: true, phone: true } }) : undefined,
    db.select().from(schema.claims).where(eq(schema.claims.anomalyId, id)).orderBy(asc(schema.claims.date)),
    a.lineId ? db.select().from(schema.receptionPhotos).where(eq(schema.receptionPhotos.lineId, a.lineId)) : Promise.resolve([]),
    receptionNumbers(),
    db.select({ m: max(schema.anomalies.number) }).from(schema.anomalies),
    // N° provisoire : rang parmi les anomalies non consolidées
    a.number ? Promise.resolve([{ n: 0 }]) : db.select({ n: sql<number>`count(*)::int` }).from(schema.anomalies).where(and(isNull(schema.anomalies.consolidatedAt), lt(schema.anomalies.createdAt, a.createdAt))),
    a.createdBy ? db.query.users.findFirst({ where: eq(schema.users.id, a.createdBy), columns: { name: true } }) : undefined,
  ]);
  const number = a.number ?? (maxNum[0]?.m ?? 0) + (rank[0]?.n ?? 0) + 1;
  void claims;
  // Procédure de réclamation du fournisseur (protocole) et délai de relance
  const process = (await supplierProcesses()).find(a.supplierId, a.supplierName);
  const docs = (rec?.documents as { type: "bl" | "facture" | "autre"; number: string; date?: string | null }[] | null) ?? (rec?.blNumber ? [{ type: "bl" as const, number: rec.blNumber }] : []);
  const reference = rec ? lineDocLabel(docs, line?.document, rec.blNumber) : a.reference;
  const locked = !!a.consolidatedAt;
  const editable = can.manageAnomalies(user.role) && !locked;
  const s = t.sheet;
  const info = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-stone-500">{label}</dt><dd className="text-right font-medium">{value ?? "—"}</dd></div>
  );

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/anomalies" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.anomalies.title}</Link>
        <Link href="/anomalies/reclamations" className="btn-secondary"><Icon name="alert" className="h-4 w-4" /> {t.claims.title}</Link>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-red-700 to-red-600 px-5 py-4 text-white">
          <div className="min-w-0">
            {/* FICHE D'ANOMALIE · N° … (provisoire) du <date de réception> / Fournisseur - Produit / Numéro et date du document */}
            <p className="text-xs font-semibold uppercase tracking-wider text-white/75">
              {s.title} · {t.anomalies.number} {number}{!a.number && <span className="ml-1 normal-case italic">({s.provisional})</span>}
              <span className="normal-case"> {s.of} {fmtDate(rec?.deliveredAt ?? a.createdAt, locale)}</span>
            </p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight">{sentence(supplier?.name ?? a.supplierName)} - {a.productName || t.anomalies.types[a.type]}</h1>
            <p className="mt-1 text-sm text-white/85">{reference || s.noDocument}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="badge bg-white text-red-800">{t.anomalies.types[a.type]}</span>
            {a.nature && <span className="badge bg-white/20 text-white">{a.nature}</span>}
            {locked && <span className="badge bg-emerald-100 text-emerald-800">✓ {s.consolidated} {fmtDate(a.consolidatedAt, locale)}</span>}
          </div>
        </div>

        <div className="grid gap-px bg-stone-200 md:grid-cols-2">
          {/* Réception d'origine */}
          <div className="bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="truck" className="h-4 w-4" /> {s.reception}</h2>
            {rec ? (
              <>
                <dl className="divide-y divide-stone-100">
                  {info(t.receptions.numberLong, <Link className="text-brand-700 hover:underline" href={`/receptions/${rec.id}`}>{numbers.get(rec.id) ?? rec.id} →</Link>)}
                  {info(t.common.supplier, supplier ? <Link className="text-brand-700 hover:underline" href={`/mercurial/fournisseurs/${supplier.id}`}>{sentence(supplier.name)}</Link> : sentence(rec.supplierName))}
                  {info(t.wizard.dateTime, fmtDateTime(rec.deliveredAt, locale))}
                  {info(t.receptions.documents, docs.map((d) => `${t.wizard.docTypes[d.type]} ${d.number}${d.date ? ` ${t.receptions.docOf} ${fmtDate(d.date, locale)}` : ""}`).join(" · ") || "—")}
                  {info(t.receptions.driver, rec.driverName)}
                  {info(t.receptions.truckTemp, rec.truckTemp != null ? `${fmtNum(rec.truckTemp, locale, 1)} °C` : null)}
                  {info(t.receptions.vehicleClean, rec.vehicleClean == null ? null : rec.vehicleClean ? t.common.yes : t.common.no)}
                </dl>
              </>
            ) : (
              <dl className="divide-y divide-stone-100">
                {info(t.common.supplier, supplier ? <Link className="text-brand-700 hover:underline" href={`/mercurial/fournisseurs/${supplier.id}`}>{sentence(supplier.name)}</Link> : sentence(a.supplierName))}
                {info(t.anomalies.blInvoice, a.reference)}
                {info(t.common.date, fmtDate(a.createdAt, locale))}
                <p className="pt-2 text-xs text-stone-500">{a.imported ? s.fromFile : s.noReception}</p>
              </dl>
            )}
          </div>

          {/* Produit concerné, tel que contrôlé à la réception */}
          <div className="bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="box" className="h-4 w-4" /> {s.product}</h2>
            {line ? (
              <>
                <dl className="divide-y divide-stone-100">
                  {info(t.common.product, line.productName)}
                  {info(t.wizard.ordered, line.qtyOrdered != null ? `${fmtNum(num(line.qtyOrdered), locale, 3)} ${line.unit ?? ""}` : null)}
                  {info(t.wizard.received, line.qtyReceived != null ? `${fmtNum(num(line.qtyReceived), locale, 3)} ${line.unit ?? ""}` : null)}
                  {info(t.wizard.temperature, line.temperature != null ? `${fmtNum(line.temperature, locale, 1)} °C` : null)}
                  {info(t.wizard.dlc, line.dlc ? fmtDate(line.dlc, locale) : null)}
                  {info(t.wizard.lot, line.lot)}
                  {info(t.wizard.unitPrice, line.unitPrice ? fmtMoney(num(line.unitPrice), locale) : null)}
                  {info(t.common.status, <span className={`badge ${decisionStyles[line.decision].badge}`}>{t.decision[line.decision]}</span>)}
                </dl>
                {photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {photos.map((p) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" className="h-20 w-20 rounded-lg border border-stone-200 object-cover" /></a>)}
                  </div>
                )}
              </>
            ) : (
              <dl className="divide-y divide-stone-100">{info(t.common.product, a.productName)}</dl>
            )}
            {a.photoUrl && !photos.length && <a href={a.photoUrl} target="_blank" rel="noreferrer"><img src={a.photoUrl} alt="" className="mt-2 h-24 rounded-lg border border-stone-200 object-cover" /></a>}
          </div>
        </div>
      </section>

      {/* Suivi : Problème, Action, Dernière action, Résultat, Économie HT, Statut */}
      {/* Procédure du fournisseur + mail pré-rempli */}
      <section className="card border-l-4 border-l-sky-400 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-semibold">{s.procedure} · {sentence(supplier?.name ?? a.supplierName)}</h2>
          <span className="badge bg-sky-100 text-sky-800">{s.delay} : {process?.delay ?? 3} {t.kanban.days}</span>
        </div>
        {process ? (
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-stone-700">
            {process.text.split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter((l) => l && !l.endsWith(":")).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-stone-500">{s.noProcess} <Link href="/protocoles" className="text-brand-700 underline">{t.nav.protocols}</Link></p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            className="btn-secondary py-1.5 text-sm"
            href={`mailto:${supplier?.email ?? ""}?subject=${encodeURIComponent(`${s.mailSubject} — ${reference ?? ""} ${a.productName ?? ""}`.trim())}&body=${encodeURIComponent(
              `${s.mailHello}\n\n${s.mailIntro} ${rec ? fmtDate(rec.deliveredAt, locale) : fmtDate(a.createdAt, locale)}${reference ? ` (${reference})` : ""} :\n- ${a.productName ?? ""} : ${a.description}${a.claimedAmount ? `\n- ${s.mailAmount} : ${fmtMoney(num(a.claimedAmount), locale)}` : ""}\n\n${s.mailAsk}\n\n${s.mailBye}`,
            )}`}
          >
            ✉ {s.mail}{supplier?.email ? ` (${supplier.email})` : ""}
          </a>
          {supplier?.phone && <a className="btn-secondary py-1.5 text-sm" href={`tel:${supplier.phone}`}>☎ {supplier.phone}</a>}
        </div>
        {!supplier?.email && <p className="mt-1 text-xs text-stone-500">{s.noEmail}</p>}
      </section>

      <AnomalySheetForm
        id={a.id}
        editable={editable}
        initial={{
          nature: a.nature ?? "",
          description: a.description,
          followUp: a.followUp ?? "",
          lastActionAt: a.lastActionAt ?? "",
          nextActionAt: a.nextActionAt ?? "",
          creditAmount: a.creditAmount != null ? String(num(a.creditAmount)).replace(".", ",") : "",
          claimedAmount: a.claimedAmount != null ? String(num(a.claimedAmount)).replace(".", ",") : "",
          stage: a.stage,
          resolution: a.resolution ?? "",
          mode: a.mode,
        }}
      />


      <p className="text-xs text-stone-500">{s.created} {fmtDateTime(a.createdAt, locale)}{author ? ` · ${author.name}` : ""}{a.imported ? ` · ${s.fromFile}` : ""}</p>
    </div>
  );
}
