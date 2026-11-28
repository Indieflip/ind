import { fmtNo } from "@/lib/numbering";
import { notFound } from "next/navigation";
import Link from "next/link";
import { WEIGH_TYPE } from "@/lib/anomaly";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtPct, num, sentence } from "@/lib/format";
import { checkPrice } from "@/lib/pricing";
import { StatusBadge, decisionStyles } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { receptionNos } from "@/lib/server/queries";
import { buildEditDraft } from "@/lib/server/editDraft";
import { InlineEditor } from "@/components/reception/InlineEditor";
import { anomalyNumbers } from "@/lib/server/savings";
import { anomalyOrigin, ORIGIN_STYLES, outcomeOf, outcomeStyles } from "@/lib/anomaly";
import { AnomalyActionField, PrintButton, DeleteReceptionButton, AddNote, ConsolidateImportedButton, UnconsolidateImportedButton, ConvertToReturnSlipButton } from "./Actions";

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url) || url.startsWith("data:application/pdf");

export default async function ReceptionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id) });
  if (!rec) notFound();
  // « Modifier » : la fiche elle-même devient modifiable (même page) ; « Modification complète » : la page de modification habituelle
  if ((await searchParams).edit === "1" && !rec.consolidatedAt && can.editReception(user.role)) {
    const [draft, nos] = await Promise.all([buildEditDraft(rec, locale), receptionNos()]);
    return (
      <div className="space-y-4">
        <Link href={`/receptions/${rec.id}`} className="no-print btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.common.cancel}</Link>
        <InlineEditor id={rec.id} initialDraft={draft} number={nos.get(rec.id) ?? "—"} />
      </div>
    );
  }
  const [lines, photos, categories, author, notes, bakery] = await Promise.all([
    db.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id)).orderBy(asc(schema.receptionLines.position)),
    db.select().from(schema.receptionPhotos).where(eq(schema.receptionPhotos.receptionId, id)),
    db.select().from(schema.categories),
    rec.createdBy ? db.query.users.findFirst({ where: eq(schema.users.id, rec.createdBy), columns: { name: true } }) : undefined,
    db
      .select({ id: schema.receptionNotes.id, text: schema.receptionNotes.text, createdAt: schema.receptionNotes.createdAt, by: schema.users.name })
      .from(schema.receptionNotes)
      .leftJoin(schema.users, eq(schema.users.id, schema.receptionNotes.createdBy))
      .where(eq(schema.receptionNotes.receptionId, id))
      .orderBy(asc(schema.receptionNotes.createdAt)),
    db.query.bakeryEntries.findFirst({ where: eq(schema.bakeryEntries.receptionId, id) }),
  ]);
  const multiDoc = new Set(lines.map((l) => l.document).filter(Boolean)).size > 1;
  const consolidator = rec.consolidatedBy ? await db.query.users.findFirst({ where: eq(schema.users.id, rec.consolidatedBy), columns: { name: true } }) : undefined;
  const locked = !!rec.consolidatedAt;
  // Bons de reprise / retour rattachés à cette livraison (fiches de sorte « reprise ») ; pour un bon : sa livraison d'origine
  const reprise = rec.kind === "reprise";
  const r = schema.receptions;
  const extraOrigins = reprise && rec.originExtraIds?.length ? await db.select({ id: r.id, deliveredAt: r.deliveredAt, blNumber: r.blNumber }).from(r).where(inArray(r.id, rec.originExtraIds)) : [];
  const [slipRecs, origin] = await Promise.all([
    reprise ? Promise.resolve([]) : db.select({ id: r.id, at: r.deliveredAt }).from(r).where(and(or(eq(r.originReceptionId, rec.id), sql`${r.originExtraIds} @> ${JSON.stringify([rec.id])}::jsonb`), eq(r.kind, "reprise"))).orderBy(asc(r.deliveredAt)),
    rec.originReceptionId ? db.query.receptions.findFirst({ where: eq(r.id, rec.originReceptionId), columns: { id: true, deliveredAt: true, blNumber: true } }) : undefined,
  ]);
  const slipLines = slipRecs.length ? await db.select({ receptionId: schema.receptionLines.receptionId, name: schema.receptionLines.productName, qty: schema.receptionLines.returnQty, unit: schema.receptionLines.returnUnit }).from(schema.receptionLines).where(inArray(schema.receptionLines.receptionId, slipRecs.map((x) => x.id))).orderBy(asc(schema.receptionLines.position)) : [];
  const editor = rec.updatedBy ? await db.query.users.findFirst({ where: eq(schema.users.id, rec.updatedBy), columns: { name: true } }) : undefined;
  // Montant HT accepté : quantité reçue × prix, hors produits refusés
  const total = lines.reduce((sum, l) => (l.decision === "refuse" ? sum : sum + (num(l.qtyReceived) ?? 0) * (num(l.unitPrice) ?? 0)), 0);
  const catName = (cid: number | null) => {
    const c = categories.find((x) => x.id === cid);
    return c ? (locale === "en" ? c.nameEn : c.nameFr) : "—";
  };
  const blPhotos = photos.filter((p) => p.kind === "bl");
  const labelPhotos = photos.filter((p) => p.kind === "label");
  const docs = ((rec.documents as { type: "bl" | "facture" | "reprise" | "autre"; number: string; date?: string | null }[] | null) ?? (rec.blNumber ? [{ type: "bl" as const, number: rec.blNumber }] : [])) as { type: "bl" | "facture" | "reprise" | "autre"; number: string; date?: string | null }[];
  const [recNos, anoNums] = await Promise.all([receptionNos(), anomalyNumbers()]);
  const no = recNos.get(rec.id) ?? "—";
  const [recAnomalies, recGaps] = await Promise.all([
    // Bon de reprise : ses fiches d'anomalie + celles de la livraison d'origine mises à jour par le bon
    db.select().from(schema.anomalies).where(reprise && (origin || extraOrigins.length) ? or(eq(schema.anomalies.receptionId, rec.id), and(inArray(schema.anomalies.receptionId, [origin?.id ?? 0, ...extraOrigins.map((o) => o.id)]), ilike(schema.anomalies.followUp, `%${no}%`))) : eq(schema.anomalies.receptionId, rec.id)).orderBy(asc(schema.anomalies.id)),
    db.select().from(schema.weighGaps).where(eq(schema.weighGaps.receptionId, rec.id)).orderBy(asc(schema.weighGaps.id)),
  ]);
  const showPrices = can.viewPrices(user.role) || can.receive(user.role);
  // BL manquant reçu après coup : référence et date saisies sur la fiche d'anomalie
  const lateDocs = recAnomalies.filter((x) => x.type === "missing_bl" && x.reference && !docs.some((d) => x.reference!.includes(d.number))).map((x) => {
    const ref = x.reference!.trim();
    const type = (/^fact/i.test(ref) ? "facture" : /^(bl|bon)/i.test(ref) ? "bl" : "autre") as "bl" | "facture" | "autre";
    return { id: x.id, no: x.number, type, number: ref.replace(/^(facture|bl|bon de livraison|bon)\s*(n°|no)?\s*/i, "").replace(/\s+du\s+\d{2}\/\d{2}\/\d{2,4}$/i, "") || ref, date: x.docDate, at: x.lastActionAt };
  });

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-2">
        <Link href="/receptions" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.nav.receptions}</Link>
        <div className="flex flex-wrap justify-end gap-2">
          {!locked && can.editReception(user.role) && (
            <>
              <Link href={`/receptions/${rec.id}?edit=1`} className="btn-primary"><Icon name="edit" className="h-4 w-4" /> {t.receptions.editHere}</Link>
              <Link href={`/receptions/${rec.id}/edit`} className="btn-secondary"><Icon name="layers" className="h-4 w-4" /> {t.receptions.editFull}</Link>
            </>
          )}
          {can.createAnomaly(user.role) && (
            <Link href={`/anomalies?reception=${rec.id}#new`} className="btn-secondary"><Icon name="alert" className="h-4 w-4" /> {t.receptions.reportAnomaly}</Link>
          )}
          {!locked && rec.importedFrom && can.consolidate(user.role) && <ConsolidateImportedButton id={rec.id} label={t.receptions.consolidateImported} confirmText={t.receptions.consolidateImportedConfirm} />}
          {locked && rec.importedFrom && can.consolidate(user.role) && <UnconsolidateImportedButton id={rec.id} label={t.receptions.unconsolidateImported} confirmText={t.receptions.unconsolidateImportedConfirm} />}
          {!reprise && can.receive(user.role) && <Link href={`/receptions/new?new=1&kind=reprise&origin=${rec.id}`} className="btn-secondary">↩ {t.returnSlip.button}</Link>}
          <PrintButton label={t.common.print} />
          {!reprise && !locked && can.editReception(user.role) && <ConvertToReturnSlipButton id={rec.id} label={t.returnSlip.convert} confirmText={t.returnSlip.convertConfirm} />}
          {!locked && can.deleteDraftReception(user.role) && <DeleteReceptionButton id={rec.id} label={t.common.delete} confirmText={t.receptions.deleteConfirm} />}
        </div>
      </div>

      {locked && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{t.receptions.consolidatedOn} {fmtDateTime(rec.consolidatedAt, locale)}{consolidator ? ` ${t.consolidation.by} ${consolidator.name}` : ` · ${t.rsheet.autoMention}`}</p>
            <p>{t.receptions.locked}</p>
          </div>
        </div>
      )}

      {/* Partie administrative : en-tête, documents, livraison, véhicule, traçabilité */}
      <section className="card overflow-hidden">
        <div className={`flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r ${reprise ? "from-amber-600 to-amber-500" : "from-brand-700 to-brand-600"} px-5 py-4 text-white`}>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{reprise ? `↩ ${t.returnSlip.detail}` : t.receptions.detail} · {no}</p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight">{sentence(rec.supplierName)}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85"><Icon name="truck" className="h-4 w-4" /> {fmtDateTime(rec.deliveredAt, locale)}</p>
            {origin && <p className="mt-1 text-sm text-white/85">{t.returnSlip.origin} : <Link href={`/receptions/${origin.id}`} className="font-semibold text-white underline decoration-white/50">{recNos.get(origin.id)}{origin.blNumber ? ` · ${origin.blNumber}` : ""} · {fmtDate(origin.deliveredAt, locale)}</Link></p>}
            {extraOrigins.map((o) => <p key={o.id} className="text-sm text-white/85">+ <Link href={`/receptions/${o.id}`} className="font-semibold text-white underline decoration-white/50">{recNos.get(o.id)}{o.blNumber ? ` · ${o.blNumber}` : ""} · {fmtDate(o.deliveredAt, locale)}</Link></p>)}
            {rec.noReturnDoc && <p className="mt-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{t.wizard.noReturnDoc}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-white px-1 py-0.5">{reprise ? <span className="badge bg-amber-100 font-semibold text-amber-900">↩ {t.returnSlip.badge}</span> : <StatusBadge status={rec.status} label={t.receptionStatus[rec.status]} />}</span>
              {/* Modifier : tant que la fiche de réception n'est pas consolidée */}
              {!locked && can.editReception(user.role) && (
                <Link href={`/receptions/${rec.id}?edit=1`} className="no-print rounded-full bg-white p-1.5 text-brand-700 hover:bg-brand-50" title={t.receptions.edit} aria-label={t.receptions.edit}><Icon name="edit" className="h-4 w-4" /></Link>
              )}
            </div>
            {showPrices && total > 0 && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-white/70">{reprise ? t.returnSlip.totalTaken : t.receptions.total}</p>
                <p className="text-xl font-bold tabular-nums">{fmtMoney(total, locale)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-px bg-stone-200 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="file" className="h-4 w-4" /> {t.receptions.documents}</h2>
            {docs.length === 0 && lateDocs.length === 0 ? <p className="text-sm text-stone-500">{t.receptions.noBl}</p> : (
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li key={d.number} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className={`badge ${d.type === "facture" ? "bg-sky-100 text-sky-800" : d.type === "reprise" ? "bg-amber-100 text-amber-900" : d.type === "autre" ? "bg-stone-100 text-stone-700" : "bg-brand-50 text-brand-800"}`}>{t.wizard.docTypes[d.type]}</span>
                    <span className="font-semibold">{d.number}</span>
                    {d.date && <span className="text-xs text-stone-500">{t.receptions.docOf} {fmtDate(d.date, locale)}</span>}
                  </li>
                ))}
                {/* BL / facture reçu après coup (saisi sur la fiche d'anomalie BL manquant) : affiché comme les autres documents, avec la mention de la mise à jour, sans modifier la fiche */}
                {lateDocs.map((d) => (
                  <li key={`late-${d.id}`} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className={`badge ${d.type === "facture" ? "bg-sky-100 text-sky-800" : d.type === "autre" ? "bg-stone-100 text-stone-700" : "bg-brand-50 text-brand-800"}`}>{t.wizard.docTypes[d.type]}</span>
                    <span className="font-semibold">{d.number}</span>
                    {d.date && <span className="text-xs text-stone-500">{t.receptions.docOf} {fmtDate(d.date, locale)}</span>}
                    <span className="w-full text-xs font-medium text-violet-700">↻ {t.receptions.lateDocMention} <Link href={`/anomalies/${d.id}`} className="underline">{fmtNo("anomaly", anoNums.get(d.id)?.n ?? d.no)}</Link>{d.at ? ` · ${t.receptions.updatedOn} ${fmtDate(d.at, locale)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {blPhotos.length > 0 && <p className="mt-2 text-xs text-stone-500">📎 {blPhotos.length} {t.receptions.attached}</p>}
          </div>

          <div className="bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="truck" className="h-4 w-4" /> {t.receptions.delivery}</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-stone-500">{reprise ? t.wizard.dateTimeReturn : t.wizard.dateTime}</dt><dd className="text-right font-medium">{fmtDateTime(rec.deliveredAt, locale)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-stone-500">{t.receptions.driver}</dt><dd className="text-right font-medium">{rec.driverName ?? "—"}</dd></div>
              {(rec.receiverSignatureUrl || rec.receiverName) && <div className="flex justify-between gap-2"><dt className="text-stone-500">{t.wizard.receiverTitle}</dt><dd className="text-right font-medium">{rec.receiverSignatureUrl ? `✓ ${rec.receiverName ?? ""}` : rec.receiverName || "—"}</dd></div>}
              {(rec.signatureUrl || rec.driverLeftUnsigned) && <div className="flex justify-between gap-2"><dt className="text-stone-500">{t.receptions.signature}</dt><dd className="text-right font-medium">{rec.signatureUrl ? `✓ ${rec.signerName ?? ""}` : rec.driverLeftUnsigned ? `⚠ ${t.wizard.driverLeft}` : "—"}</dd></div>}
            </dl>
          </div>

          {/* (bon de reprise : ni véhicule, ni conformité) */}
          {!reprise && <div className="bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="thermo" className="h-4 w-4" /> {t.receptions.vehicle}</h2>
            <div className="flex flex-wrap gap-2">
              <div className={`flex-1 rounded-lg px-3 py-2 ${rec.truckTemp == null ? "bg-stone-50 text-stone-500" : rec.truckTemp > 4 ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
                <p className="text-[11px] font-semibold uppercase">{t.receptions.truckTemp}</p>
                <p className="text-lg font-bold tabular-nums">{rec.truckTemp != null ? `${fmtNum(rec.truckTemp, locale, 1)} °C` : "—"}</p>
              </div>
              <div className={`flex-1 rounded-lg px-3 py-2 ${rec.vehicleClean == null ? "bg-stone-50 text-stone-500" : rec.vehicleClean ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                <p className="text-[11px] font-semibold uppercase">{t.receptions.vehicleClean}</p>
                <p className="text-lg font-bold">{rec.vehicleClean == null ? "—" : rec.vehicleClean ? t.common.yes : t.common.no}</p>
              </div>
            </div>
          </div>}

          <div className="bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Icon name="check" className="h-4 w-4" /> {t.receptions.summary}</h2>
            <div className={`mb-2 grid ${reprise ? "grid-cols-1" : "grid-cols-4"} gap-1.5 text-center`}>
              {!reprise && (["conform", "reserve", "refuse"] as const).map((d) => (
                <div key={d} className={`rounded-lg py-1.5 ${decisionStyles[d].badge}`}>
                  <p className="text-lg font-bold leading-none">{lines.filter((l) => l.decision === d).length}</p>
                  <p className="text-[10px] font-semibold">{t.decision[d]}</p>
                </div>
              ))}
              {/* Anomalie : fiches d'anomalie de la fiche, en orange */}
              <div className="rounded-lg bg-orange-100 py-1.5 text-orange-800">
                <p className="text-lg font-bold leading-none">{recAnomalies.length}</p>
                <p className="text-[10px] font-semibold">{t.wizard.anomalyTile}</p>
              </div>
            </div>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-stone-500">{t.receptions.createdBy}</dt><dd className="text-right font-medium">{author?.name ?? "—"}</dd></div>
              {rec.updatedAt && <div className="flex justify-between gap-2"><dt className="text-stone-500">{t.receptions.editedOn}</dt><dd className="text-right font-medium">{fmtDateTime(rec.updatedAt, locale)}{editor ? ` · ${editor.name}` : ""}</dd></div>}
            </dl>
          </div>
        </div>
      </section>

      {/* Mobile : une carte par produit */}
      <ul className="space-y-2 md:hidden print:hidden">
        {lines.map((l) => {
          const pc = checkPrice(num(l.unitPrice), { min: num(l.mercurialMin), max: num(l.mercurialPrice), locked: l.priceLocked });
          const gap = pc.kind === "increase" || pc.kind === "decrease" || pc.kind === "locked" ? pc.pct : null;
          return (
            <li key={l.id} className={`card border-l-4 ${decisionStyles[l.decision].border} p-3 text-sm`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{l.productName}{l.document && multiDoc && <span className="ml-1 text-xs font-normal text-stone-500">· {l.document}</span>}{l.originRef && <span className="mt-0.5 block text-xs font-medium text-amber-800">↩ {l.originRef}</span>}</span>
                <span className={`badge ${decisionStyles[l.decision].badge}`}>{t.decision[l.decision]}</span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                <div><dt className="text-stone-500">{reprise ? t.returnSlip.qtyOnSlip : t.wizard.ordered}</dt><dd>{fmtNum(l.qtyOrdered, locale)} {l.unit}</dd></div>
                <div><dt className="text-stone-500">{reprise ? t.returnSlip.qtyTaken : t.wizard.received}</dt><dd>{fmtNum(l.qtyReceived, locale)} {l.unit}</dd></div>
                {!reprise && <div><dt className="text-stone-500">{t.wizard.temperature}</dt><dd>{l.temperature != null ? `${fmtNum(l.temperature, locale, 1)} °C` : "—"}</dd></div>}
                {!reprise && <div><dt className="text-stone-500">{t.wizard.dlc}</dt><dd>{fmtDate(l.dlc, locale)}</dd></div>}
                <div><dt className="text-stone-500">{t.wizard.lot}</dt><dd>{l.lot ?? "—"}</dd></div>
                {showPrices && (
                  <div><dt className="text-stone-500">{t.common.price}</dt><dd>{fmtMoney(l.unitPrice, locale)}{gap ? <span className={gap > 0 ? " text-red-600" : " text-emerald-600"}> {fmtPct(gap)}</span> : null}</dd></div>
                )}
              </dl>
              {l.reason && <p className="mt-1 text-xs text-stone-600">{(t.reasons as Record<string, string>)[l.reason] ?? l.reason}</p>}
              {(l.refuseQty != null || l.returnQty != null || l.returnKind || l.refuseUnit || l.returnUnit) && <p className="mt-1 text-xs font-medium text-red-700">{[l.refuseQty != null ? `${t.decision.refuse} : ${fmtNum(num(l.refuseQty))} ${l.refuseUnit ?? l.unit ?? ""}` : l.returnKind === "refus" && l.returnQty != null ? `${t.decision.refuse} : ${fmtNum(num(l.returnQty))} ${l.unit ?? ""}` : l.refuseUnit ? t.decision.refuse : "", l.returnQty != null && l.returnKind !== "refus" ? `${t.wizard.returnBtn} : ${fmtNum(num(l.returnQty))} ${l.returnUnit ?? l.unit ?? ""}` : l.returnUnit ? t.wizard.returnBtn : ""].filter(Boolean).join(" · ")}</p>}
              {l.note && <p className="mt-1 text-xs italic text-stone-600">{t.wizard.note} : {l.note}</p>}
              <div className="mt-1 flex gap-2">
                {photos.filter((p) => p.lineId === l.id).map((p) => (
                  <a key={p.id} href={p.url} target="_blank"><img src={p.url} alt="" className="h-14 w-14 rounded object-cover" /></a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <section className={`card hidden overflow-x-auto ${lines.length ? "md:block print:block" : ""}`}>
        <table className="table">
          <thead>
            <tr>
              {multiDoc && <th>{t.receptions.blInvoice}</th>}
              <th>{t.common.product}</th>
              <th>{t.common.category}</th>
              <th className="text-right">{reprise ? t.returnSlip.qtyOnSlip : t.wizard.ordered}</th>
              <th className="text-right">{reprise ? t.returnSlip.qtyTaken : t.wizard.received}</th>
              {!reprise && <th className="text-right">{t.wizard.temperature}</th>}
              {!reprise && <th>{t.wizard.dlc}</th>}
              <th>{t.wizard.lot}</th>
              {showPrices && <th className="text-right">{t.wizard.unitPrice}</th>}
              <th>{t.common.status}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const pc = checkPrice(num(l.unitPrice), { min: num(l.mercurialMin), max: num(l.mercurialPrice), locked: l.priceLocked });
          const gap = pc.kind === "increase" || pc.kind === "decrease" || pc.kind === "locked" ? pc.pct : null;
              const linePhotos = photos.filter((p) => p.lineId === l.id);
              return (
                <tr key={l.id} className={`border-l-4 ${decisionStyles[l.decision].border}`}>
                  {multiDoc && <td className="whitespace-nowrap text-stone-600">{l.document ?? "—"}</td>}
                  <td className="font-medium">{l.productName}{l.originRef && <span className="block text-xs font-normal text-amber-800">↩ {l.originRef}</span>}</td>
                  <td className="text-stone-500">{catName(l.categoryId)}</td>
                  <td className="text-right tabular-nums">{fmtNum(l.qtyOrdered, locale)} {l.qtyOrdered ? l.unit : ""}</td>
                  <td className="text-right tabular-nums">{fmtNum(l.qtyReceived, locale)} {l.qtyReceived ? l.unit : ""}</td>
                  {!reprise && <td className="text-right tabular-nums">{l.temperature != null ? `${fmtNum(l.temperature, locale, 1)} °C` : "—"}</td>}
                  {!reprise && <td>{fmtDate(l.dlc, locale)}</td>}
                  <td>{l.lot ?? "—"}</td>
                  {showPrices && (
                    <td className="text-right tabular-nums">
                      {fmtMoney(l.unitPrice, locale)}
                      {gap != null && gap !== 0 && <div className={`text-xs font-semibold ${gap > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtPct(gap)}</div>}
                    </td>
                  )}
                  <td>
                    <span className={`badge ${decisionStyles[l.decision].badge}`}>{t.decision[l.decision]}</span>
                    {l.reason && <div className="mt-1 text-xs text-stone-600">{(t.reasons as Record<string, string>)[l.reason] ?? l.reason}</div>}
                    {(l.refuseQty != null || l.returnQty != null || l.returnKind || l.refuseUnit || l.returnUnit) && <div className="mt-1 text-xs font-medium text-red-700">{[l.refuseQty != null ? `${t.decision.refuse} : ${fmtNum(num(l.refuseQty))} ${l.refuseUnit ?? l.unit ?? ""}` : l.returnKind === "refus" && l.returnQty != null ? `${t.decision.refuse} : ${fmtNum(num(l.returnQty))} ${l.unit ?? ""}` : l.refuseUnit ? t.decision.refuse : "", l.returnQty != null && l.returnKind !== "refus" ? `${t.wizard.returnBtn} : ${fmtNum(num(l.returnQty))} ${l.returnUnit ?? l.unit ?? ""}` : l.returnUnit ? t.wizard.returnBtn : ""].filter(Boolean).join(" · ")}</div>}
                    {l.note && <div className="mt-1 text-xs italic text-stone-600">{t.wizard.note} : {l.note}</div>}
                    {linePhotos.map((p) => (
                      <a key={p.id} href={p.url} target="_blank" className="mt-1 block"><img src={p.url} alt="" className="h-14 w-14 rounded object-cover" /></a>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {slipRecs.length > 0 && (
        <section className="card overflow-hidden border-l-4 border-l-amber-400">
          <h2 className="px-4 pt-3 font-semibold">↩ {t.returnSlip.slipsTitle}</h2>
          <ul className="divide-y divide-stone-100 px-4 pb-3 text-sm">
            {slipRecs.map((b) => (
              <li key={b.id} className="py-2">
                <Link href={`/receptions/${b.id}`} className="font-semibold text-brand-700 hover:underline">{recNos.get(b.id)}</Link> · {fmtDate(b.at, locale)} · {slipLines.filter((i) => i.receptionId === b.id).map((i) => `${i.name}${i.qty != null ? ` ${fmtNum(num(i.qty))} ${i.unit ?? ""}` : ""}`).join(" · ")}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(recAnomalies.length > 0 || recGaps.length > 0) && (
        <section className="card overflow-hidden border-l-4 border-l-red-400">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold"><Icon name="alert" className="h-5 w-5 text-red-600" /> {t.nav.anomalies}</h2>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {recAnomalies.length > 0 && <span className="badge bg-red-100 text-red-800">{recAnomalies.length} {t.receptions.anomalyCount}</span>}
              {/* Fiches d'anomalie créées pour ce bon : lien direct par numéro */}
              {recAnomalies.map((a) => (
                <Link key={a.id} href={`/anomalies/${a.id}`} className="badge bg-white font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">{fmtNo("anomaly", anoNums.get(a.id)?.n ?? a.number)}</Link>
              ))}
              {recAnomalies.filter((a) => a.status === "open").length > 0 && <span className="badge bg-amber-100 text-amber-900">{recAnomalies.filter((a) => a.status === "open").length} {t.receptions.toFollow}</span>}
              {recGaps.length > 0 && <span className="badge bg-sky-100 text-sky-800">{recGaps.length} {t.weigh.title.toLowerCase()} · {fmtMoney(recGaps.reduce((x, g) => x + (num(g.gapAmount) ?? 0), 0), locale)}</span>}
            </div>
          </div>
          {recAnomalies.length > 0 && (
            <ul className="divide-y divide-stone-100">
              {recAnomalies.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/anomalies/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      <span className="mr-1.5 font-semibold">{fmtNo("anomaly", anoNums.get(a.id)?.n ?? a.number)}</span>
                      {/* Origine (Pesée, Retour, Refus…) + type d'anomalie de la fiche : deux fiches du même produit se distinguent */}
                      <span className={`badge mr-1.5 ${ORIGIN_STYLES[anomalyOrigin(a)]}`}>{t.anomalies.origins[anomalyOrigin(a)]}</span>
                      {a.problemType || t.anomalies.types[a.type]}{a.blocks?.length ? ` + ${a.blocks.map((b) => b.problemType).filter(Boolean).join(" + ")}` : ""}{a.productName ? ` · ${a.productName}` : ""} →
                    </Link>
                    <p className="text-stone-600">{a.description}</p>
                    <AnomalyActionField id={a.id} initial={a.followUp ?? ""} editable={can.manageAnomalies(user.role) && !a.consolidatedAt} label={t.receptions.actions} saveLabel={t.common.save} savedLabel={t.receptions.actionSaved} />

                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={a.status} label={t.anomalies.statuses[a.status]} />
                    <span className={`badge ${outcomeStyles[outcomeOf(a.result)]}`}>{t.anomalies.result} : {t.anomalies.outcomes[outcomeOf(a.result)]}</span>
                    {a.creditAmount && <span className="text-xs text-stone-600">{t.anomalies.saving} {fmtMoney(num(a.creditAmount), locale)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {recGaps.length > 0 && (
            <div className="border-t border-stone-100 px-5 py-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">{t.weigh.title}</p>
              <ul className="space-y-1 text-sm">
                {recGaps.map((g) => (
                  <li key={g.id} className="flex flex-wrap justify-between gap-2">
                    <span>{g.product} : {t.wizard.ordered} {fmtNum(num(g.qtyInvoiced), locale, 3)} kg · {t.wizard.received} {fmtNum(num(g.qtyWeighed), locale, 3)} kg</span>
                    <span className={`font-semibold tabular-nums ${(num(g.gapQty) ?? 0) < 0 ? "text-sky-700" : "text-red-700"}`}>{fmtNum(num(g.gapQty), locale, 3)} kg{g.gapAmount ? ` · ${fmtMoney(num(g.gapAmount), locale)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="no-print flex gap-3 border-t border-stone-100 px-5 py-2 text-sm">
            <Link href="/anomalies" className="font-medium text-brand-700 hover:underline">{t.receptions.seeAnomalies} →</Link>
            {recGaps.length > 0 && <Link href={`/anomalies?${new URLSearchParams({ view: "liste", type: WEIGH_TYPE })}`} className="font-medium text-brand-700 hover:underline">{WEIGH_TYPE} →</Link>}
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">{t.receptions.reservesText}</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700">{rec.reservesText || t.wizard.noReserves}</pre>
        </section>
        {rec.signatureUrl && <section className="card p-5">
          <h2 className="mb-2 font-semibold">{t.receptions.signature}</h2>
          {rec.signatureUrl ? <img src={rec.signatureUrl} alt="" className="h-32 rounded border border-stone-200 bg-white" /> : <p className="text-sm text-stone-500">—</p>}
          {rec.signerName && <p className="mt-1 text-sm">{rec.signerName}</p>}
        </section>}
      </div>

      {bakery && (
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">{t.wizard.bakery}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(["baguette", "hamburger", "rolls", "painDeMie"] as const).map((k) => (
              <div key={k}><dt className="text-stone-500">{t.bakery[k]}</dt><dd className="font-medium tabular-nums">{fmtNum(bakery[k], locale)}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {locked && (
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">{t.receptions.notes}</h2>
          {notes.length === 0 ? (
            <p className="text-sm text-stone-500">{t.receptions.noNotes}</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-stone-50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.text}</p>
                  <p className="mt-1 text-xs text-stone-500">{fmtDateTime(n.createdAt, locale)}{n.by ? ` · ${n.by}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
          {can.addNote(user.role) && <AddNote receptionId={rec.id} placeholder={t.receptions.notePlaceholder} label={t.receptions.addNote} />}
        </section>
      )}

      {blPhotos.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">{t.receptions.blPhotos}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {blPhotos.map((p) => (
              <a key={p.id} href={p.url} target="_blank">
                {isPdf(p.url) ? (
                  <span className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-600"><Icon name="file" className="h-8 w-8" />PDF</span>
                ) : (
                  <img src={p.url} alt="" className="w-full rounded-lg border border-stone-200" />
                )}
              </a>
            ))}
          </div>
        </section>
      )}
      {labelPhotos.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">{t.wizard.photoLabelTitle}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {labelPhotos.map((p) => (
              <a key={p.id} href={p.url} target="_blank"><img src={p.url} alt="" className="w-full rounded-lg border border-stone-200" /></a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
