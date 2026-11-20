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
import { claimStyles, isInformative } from "@/lib/anomaly";
import { AnomalySheetForm } from "./SheetClient";
import { ActionCard, ReviewButtons } from "./CardClient";
import { ensureClaimNumbers } from "@/lib/server/claimNumbers";
import { supplierProcesses } from "@/lib/server/followup";
import { problemTypes } from "@/lib/server/problemTypes";

/** Fiche d'anomalie : la réception d'origine et tout le suivi (problème, action, résultat, économie, statut) */
export default async function AnomalySheet({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  await ensureClaimNumbers();
  const a = await db.query.anomalies.findFirst({ where: eq(schema.anomalies.id, id) });
  if (!a) notFound();
  const [rec, line, supplier, claims, photos, numbers, maxNum, rank, author] = await Promise.all([
    a.receptionId ? db.query.receptions.findFirst({ where: eq(schema.receptions.id, a.receptionId) }) : undefined,
    a.lineId ? db.query.receptionLines.findFirst({ where: eq(schema.receptionLines.id, a.lineId) }) : undefined,
    a.supplierId ? db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, a.supplierId), columns: { id: true, name: true, email: true, phone: true, contacts: true } }) : undefined,
    db.select().from(schema.claims).where(eq(schema.claims.anomalyId, id)).orderBy(asc(schema.claims.date)),
    a.lineId ? db.select().from(schema.receptionPhotos).where(eq(schema.receptionPhotos.lineId, a.lineId)) : Promise.resolve([]),
    receptionNumbers(),
    db.select({ m: max(schema.anomalies.number) }).from(schema.anomalies),
    // N° provisoire : rang parmi les anomalies non consolidées
    a.number ? Promise.resolve([{ n: 0 }]) : db.select({ n: sql<number>`count(*)::int` }).from(schema.anomalies).where(and(isNull(schema.anomalies.consolidatedAt), lt(schema.anomalies.createdAt, a.createdAt))),
    a.createdBy ? db.query.users.findFirst({ where: eq(schema.users.id, a.createdBy), columns: { name: true } }) : undefined,
  ]);
  const number = a.number ?? (maxNum[0]?.m ?? 0) + (rank[0]?.n ?? 0) + 1;
  // Type de problème (liste modifiable) et produits du fournisseur pour le rattachement
  const typeLabel = t.anomalies.types[a.type];
  const problemType = a.problemType || typeLabel;
  const [types, supplierProducts, unitRows] = await Promise.all([
    problemTypes(Object.values(t.anomalies.types)),
    a.supplierId ? db.select({ id: schema.products.id, name: schema.products.name, unit: schema.products.unit, price: sql<number | null>`${schema.products.price}::float` }).from(schema.products).where(and(eq(schema.products.supplierId, a.supplierId), eq(schema.products.active, true))).orderBy(asc(schema.products.name)) : Promise.resolve([] as { id: number; name: string; unit: string; price: number | null }[]),
    db.select({ name: schema.units.name }).from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
  ]);
  const productId = a.productId ?? line?.productId ?? null;
  // Produits de la fiche par défaut : celui de la ligne du bon (quantité manquante si on la connaît)
  const gap = line && line.qtyOrdered != null && line.qtyReceived != null ? Math.round((num(line.qtyOrdered)! - num(line.qtyReceived)!) * 1000) / 1000 : null;
  const itemsDefault = (a.productName || line?.productName) ? [{ productId, name: a.productName ?? line?.productName ?? "", qty: gap != null && gap > 0 ? gap : null, unit: line?.unit ?? "", price: line?.unitPrice != null ? num(line.unitPrice) : null }] : [];

  const process = (await supplierProcesses()).find(a.supplierId, a.supplierName);
  // Unité tapée à la main rattachée à l'unité existante de même nom (« kg » = « Kg »)
  const unitKey = (u: string) => u.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const canonUnit = (u: string) => unitRows.find((x) => unitKey(x.name) === unitKey(u))?.name ?? u;
  // Actions Assistant : ce que l'application a fait ou prévoit pour cette fiche (calculé, non modifiable)
  const S = t.sheet.assistant;
  const addDays = (d: string | Date, n: number) => { const x = new Date(typeof d === "string" ? `${d}T12:00:00` : d); x.setDate(x.getDate() + n); return x; };
  const assistant: { date: string | null; text: string }[] = [];
  let nextDue: string | null = null;
  if (a.imported) assistant.push({ date: fmtDate(a.createdAt, locale), text: S.imported });
  else if (rec) assistant.push({ date: fmtDate(a.createdAt, locale), text: `${S.createdFrom} ${numbers.get(rec.id) ?? rec.id}` });
  else assistant.push({ date: fmtDate(a.createdAt, locale), text: `${S.createdBy}${author ? ` ${author.name}` : ""}` });
  if (a.claimNo) assistant.push({ date: null, text: `${S.claimNumber} ${a.claimNo}` });
  if (isInformative(a)) assistant.push({ date: null, text: S.informative });
  if (a.lastActionAt) assistant.push({ date: fmtDate(a.lastActionAt, locale), text: S.lastAction });
  const open = !a.consolidatedAt && ["a_traiter", "reclamee", "a_verifier"].includes(a.stage);
  if (open) {
    const from = a.lastActionAt ?? a.createdAt;
    if (a.mode === "verification") {
      const due = addDays(from, a.stage === "a_verifier" ? 15 : 7);
      nextDue = fmtDate(due, locale);
      assistant.push({ date: fmtDate(due, locale), text: due < new Date() ? S.verifyLate : S.verifyPlanned });
    } else if (a.stage !== "a_traiter") {
      const due = addDays(from, process?.delay ?? 3);
      nextDue = fmtDate(due, locale);
      assistant.push({ date: fmtDate(due, locale), text: due < new Date() ? S.followLate : S.followPlanned });
    } else assistant.push({ date: null, text: S.toProcess });
  }
  if (a.resolution === "avoir" && a.creditAmount) assistant.push({ date: a.creditDate ? fmtDate(a.creditDate, locale) : null, text: `${S.saving} ${fmtMoney(num(a.creditAmount), locale)}` });
  if (a.consolidatedAt) assistant.push({ date: fmtDate(a.consolidatedAt, locale), text: S.consolidated });
  void claims;
  // Procédure de réclamation du fournisseur (protocole) et délai de relance
  // Coordonnées « Réclamation » du fournisseur en priorité, sinon celles de la société
  // Adresse de réclamation (sinon société) + les mails ajoutés avec le « + » du même bloc
  const mailsOf = (c?: { email?: string; extra?: { label: string; value: string }[] }) => [c?.email, ...(c?.extra ?? []).filter((x) => x.label === "email").map((x) => x.value)].filter(Boolean) as string[];
  const claimMails = mailsOf(supplier?.contacts?.reclamation);
  const claimEmail = (claimMails.length ? claimMails : mailsOf(supplier?.contacts?.societe)).join(",") || supplier?.email || "";
  const claimPhone = supplier?.contacts?.reclamation?.phone || supplier?.contacts?.societe?.phone || supplier?.phone || "";
  const docs = (rec?.documents as { type: "bl" | "facture" | "autre"; number: string; date?: string | null }[] | null) ?? (rec?.blNumber ? [{ type: "bl" as const, number: rec.blNumber }] : []);
  const reference = rec ? lineDocLabel(docs, line?.document, rec.blNumber) : a.reference;
  const locked = !!a.consolidatedAt;
  const editable = can.manageAnomalies(user.role) && !locked;
  const s = t.sheet;
  const info = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-stone-500">{label}</dt><dd className="text-right font-medium">{value ?? "—"}</dd></div>
  );

  // Ce qui s'est passé : actions de l'Assistant et actions de l'utilisateur (« JJ/MM/AA : … »), dans l'ordre
  const userLines = (a.followUp ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\d{2}\/\d{2}\/\d{2})\s*:\s*(.*)$/.exec(l);
    return { date: m ? m[1] : null, text: m ? m[2] : l, user: true };
  });
  const sortKey = (d: string | null) => (d ? d.split("/").reverse().join("") : "99");
  const timeline = [...assistant.map((x) => ({ ...x, user: false })), ...userLines].map((x, i) => ({ ...x, i })).sort((x, y) => sortKey(x.date).localeCompare(sortKey(y.date)) || x.i - y.i);
  const mailHref = `mailto:${claimEmail}?subject=${encodeURIComponent(`${s.mailSubject} — ${reference ?? ""} ${a.productName ?? ""}`.trim())}&body=${encodeURIComponent(
    `${s.mailHello}\n\n${s.mailIntro} ${rec ? fmtDate(rec.deliveredAt, locale) : fmtDate(a.createdAt, locale)}${reference ? ` (${reference})` : ""} :\n${(a.items?.length ? a.items.map((x) => `- ${x.name}${x.qty != null ? ` : ${x.qty} ${x.unit}` : ""}`).join("\n") : `- ${a.productName ?? ""} : ${a.description}`)}${a.claimedAmount ? `\n- ${s.mailAmount} : ${fmtMoney(num(a.claimedAmount), locale)}` : ""}\n\n${s.mailAsk}\n\n${s.mailBye}`,
  )}`;
  const itemsLabel = a.items?.length ? a.items.map((x) => x.name).join(" · ") : a.productName ?? line?.productName ?? "";
  const stageCls: Record<string, string> = { a_traiter: "bg-red-100 text-red-800", reclamee: "bg-amber-100 text-amber-900", a_verifier: "bg-sky-100 text-sky-800", cloturee: "bg-emerald-100 text-emerald-800", annulee: "bg-stone-200 text-stone-700" };
  const fold = "group rounded-xl border border-stone-200 bg-white";
  const summary = "flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[15px] hover:bg-stone-50";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/anomalies" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.anomalies.title}</Link>
        <ReviewButtons id={a.id} value={a.review ?? null} editable={can.manageAnomalies(user.role)} />
      </div>

      {/* La carte : l'essentiel, la prochaine étape et les actions */}
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-stone-500">{s.title} · {t.anomalies.number} {number} · {fmtDate(rec?.deliveredAt ?? a.createdAt, locale)}{reference ? ` · ${reference}` : ""}</p>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{sentence(supplier?.name ?? a.supplierName)} — {problemType}</h1>
            {itemsLabel && <p className="text-base text-stone-700">{itemsLabel}</p>}
            {a.claimNo && <p className="text-xs text-stone-500">{t.claims.title} N° {a.claimNo}</p>}
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${stageCls[a.stage] ?? "bg-stone-100"}`}>{t.stages[a.stage as "a_traiter"] ?? a.stage}</span>
            <p className="text-3xl font-bold tabular-nums">{a.claimedAmount ? fmtMoney(num(a.claimedAmount), locale) : "—"}</p>
            <p className="text-xs text-stone-500">{s.claimed}</p>
            {locked && <span className="badge bg-emerald-100 text-emerald-800">✓ {s.consolidated} {fmtDate(a.consolidatedAt, locale)}</span>}
          </div>
        </div>
        <div className="border-t border-stone-100 p-6 pt-4">
          <ActionCard id={a.id} stage={a.stage} resolution={a.resolution} editable={editable} claimed={a.claimedAmount != null ? String(num(a.claimedAmount)).replace(".", ",") : ""} mailHref={mailHref} phone={claimPhone} supplier={sentence(supplier?.name ?? a.supplierName)} nextDate={nextDue} />
        </div>
      </section>

      {/* Ce qui s'est passé */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">{s.card.history}</h2>
        <ol className="space-y-2">
          {timeline.map((x) => (
            <li key={x.i} className="grid grid-cols-[5.5rem_1.5rem_minmax(0,1fr)] items-start gap-1 text-[15px]">
              <span className="tabular-nums text-stone-500">{x.date ?? ""}</span>
              <span aria-hidden="true">{x.user ? "👤" : "🤖"}</span>
              <span className={x.user ? "text-stone-900" : "text-stone-700"}>{x.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Le reste, replié */}
      <details className={fold}>
        <summary className={summary}><span><strong>{s.card.details}</strong> · {s.card.detailsHint}</span><span className="text-stone-400 transition group-open:rotate-90">▸</span></summary>
        <div className="space-y-4 border-t border-stone-100 bg-stone-50/60 p-4">
      <AnomalySheetForm
        informative={isInformative(a)}
        id={a.id}
        editable={editable}
        types={types}
        units={unitRows.map((u) => u.name)}
        assistant={assistant}
        showAssistant={false}
        products={supplierProducts}
        initial={{
          items: (a.items?.length ? a.items : itemsDefault).map((x) => {
            // Prix du Mercurial repris par erreur sur une ligne d'une autre unité (ex. Kg au Mercurial, Pièce ici) : retiré
            const p = x.productId ? supplierProducts.find((y) => y.id === x.productId) : undefined;
            const wrongPrice = !!p && !!x.unit && !!p.unit && unitKey(x.unit) !== unitKey(p.unit) && x.price != null && p.price != null && Math.abs(x.price - p.price) < 0.0001;
            return { productId: x.productId, name: x.name, qty: x.qty != null ? String(x.qty).replace(".", ",") : "", unit: canonUnit(x.unit ?? ""), price: x.price != null && !wrongPrice ? String(x.price).replace(".", ",") : "" };
          }),
          problemType,
          productId,
          productName: a.productName ?? line?.productName ?? "",
          note: a.note ?? "",
          description: a.description,
          followUp: a.followUp ?? "",
          lastActionAt: a.lastActionAt ?? "",
          nextActionAt: a.nextActionAt ?? "",
          creditAmount: a.creditAmount != null ? String(num(a.creditAmount)).replace(".", ",") : "",
          claimedAmount: a.claimedAmount != null ? String(num(a.claimedAmount)).replace(".", ",") : "",
          stage: a.stage,
          resolution: a.resolution ?? "",
          mode: a.mode,
          creditNumber: a.creditNumber ?? "",
          creditDate: a.creditDate ?? "",
          creditKind: a.creditKind ?? "avoir",
        }}
      />


        </div>
      </details>

      <details className={fold}>
        <summary className={summary}><span><strong>{s.reception}</strong>{rec ? ` · N° ${numbers.get(rec.id) ?? rec.id}, ${fmtDateTime(rec.deliveredAt, locale)}` : ""}</span><span className="text-stone-400 transition group-open:rotate-90">▸</span></summary>
        <div className="grid gap-px border-t border-stone-100 bg-stone-200 md:grid-cols-2">
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
      </details>

      <details className={fold}>
        <summary className={summary}><span><strong>{s.procedure}</strong> · {sentence(supplier?.name ?? a.supplierName)} · {s.delay} {process?.delay ?? 3} {t.kanban.days}</span><span className="text-stone-400 transition group-open:rotate-90">▸</span></summary>
        <div className="border-t border-stone-100 p-1">
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
            href={`mailto:${claimEmail}?subject=${encodeURIComponent(`${s.mailSubject} — ${reference ?? ""} ${a.productName ?? ""}`.trim())}&body=${encodeURIComponent(
              `${s.mailHello}\n\n${s.mailIntro} ${rec ? fmtDate(rec.deliveredAt, locale) : fmtDate(a.createdAt, locale)}${reference ? ` (${reference})` : ""} :\n- ${a.productName ?? ""} : ${a.description}${a.claimedAmount ? `\n- ${s.mailAmount} : ${fmtMoney(num(a.claimedAmount), locale)}` : ""}\n\n${s.mailAsk}\n\n${s.mailBye}`,
            )}`}
          >
            ✉ {s.mail}{claimEmail ? ` (${claimEmail})` : ""}
          </a>
          {claimPhone && <a className="btn-secondary py-1.5 text-sm" href={`tel:${claimPhone}`}>☎ {claimPhone}</a>}
        </div>
        {!claimEmail && <p className="mt-1 text-xs text-stone-500">{s.noEmail}</p>}
      </section>

        </div>
      </details>

      <p className="text-xs text-stone-500">{s.created} {fmtDateTime(a.createdAt, locale)}{author ? ` · ${author.name}` : ""}{a.imported ? ` · ${s.fromFile}` : ""}</p>
    </div>
  );
}
