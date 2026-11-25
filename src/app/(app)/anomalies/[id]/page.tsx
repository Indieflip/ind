import { fmtNo } from "@/lib/numbering";
import { anomalyNumbers } from "@/lib/server/savings";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";

/** Réclamation par mail : ouverte dans Outlook (web), dans un nouvel onglet, déjà rédigée */
const OUTLOOK_COMPOSE = "https://outlook.live.com/mail/0/deeplink/compose";
import { WEIGH_TYPE } from "@/lib/anomaly";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, lt, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, num, sentence } from "@/lib/format";
import { lineDocLabel } from "@/lib/documents";
import { receptionNumbers } from "@/lib/server/queries";
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
  const [rec, line, supplier, claims, photos, numbers, anoNums, author] = await Promise.all([
    a.receptionId ? db.query.receptions.findFirst({ where: eq(schema.receptions.id, a.receptionId) }) : undefined,
    a.lineId ? db.query.receptionLines.findFirst({ where: eq(schema.receptionLines.id, a.lineId) }) : undefined,
    a.supplierId ? db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, a.supplierId), columns: { id: true, name: true, email: true, phone: true, contacts: true } }) : undefined,
    db.select().from(schema.claims).where(eq(schema.claims.anomalyId, id)).orderBy(asc(schema.claims.date)),
    a.lineId ? db.select().from(schema.receptionPhotos).where(eq(schema.receptionPhotos.lineId, a.lineId)) : Promise.resolve([]),
    receptionNumbers(),
    anomalyNumbers(),
    a.createdBy ? db.query.users.findFirst({ where: eq(schema.users.id, a.createdBy), columns: { name: true } }) : undefined,
  ]);
  // N° de fiche (FA…) : par année de création
  const number = anoNums.get(a.id)?.n ?? a.number ?? null;
  const claimYear = anoNums.get(a.id)?.year;
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
  if (a.claimNo) assistant.push({ date: null, text: `${S.claimNumber} ${fmtNo("claim", a.claimNo)}` });
  if (isInformative(a)) assistant.push({ date: null, text: S.informative });
  if (a.lastActionAt) assistant.push({ date: fmtDate(a.lastActionAt, locale), text: S.lastAction });
  const open = ["a_traiter", "reclamee", "a_verifier"].includes(a.stage);
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
  void claims;
  void photos;
  // Procédure de réclamation du fournisseur (protocole) et délai de relance
  // Coordonnées « Réclamation » du fournisseur en priorité, sinon celles de la société
  // Adresse de réclamation (sinon société) + les mails ajoutés avec le « + » du même bloc
  const mailsOf = (c?: { email?: string; extra?: { label: string; value: string }[] }) => [c?.email, ...(c?.extra ?? []).filter((x) => x.label === "email").map((x) => x.value)].filter(Boolean) as string[];
  const claimMails = mailsOf(supplier?.contacts?.reclamation);
  const claimEmail = (claimMails.length ? claimMails : mailsOf(supplier?.contacts?.societe)).join(",") || supplier?.email || "";
  const claimPhone = supplier?.contacts?.reclamation?.phone || supplier?.contacts?.societe?.phone || supplier?.phone || "";
  const docs = (rec?.documents as { type: "bl" | "facture" | "autre"; number: string; date?: string | null }[] | null) ?? (rec?.blNumber ? [{ type: "bl" as const, number: rec.blNumber }] : []);
  const reference = rec ? lineDocLabel(docs, line?.document, rec.blNumber) : a.reference;
  // Date BL / Facture : enregistrée sur la fiche, sinon celle du document du bon, la livraison, la référence ou la fiche
  const lineDocDate = (line?.document && docs.find((d) => d.number === line.document)?.date) || docs.find((d) => d.date)?.date;
  const refDate = /du (\d{2})\/(\d{2})\/(\d{2})/.exec(a.reference ?? "");
  const parisDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const docDateFallback = lineDocDate || (rec ? parisDay(rec.deliveredAt) : refDate ? `20${refDate[3]}-${refDate[2]}-${refDate[1]}` : parisDay(a.createdAt));
  // Les fiches d'anomalie ne sont jamais figées (seules les fiches de réception le sont)
  const locked = false;
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
  const mailHref = `${OUTLOOK_COMPOSE}?to=${encodeURIComponent(claimEmail)}&subject=${encodeURIComponent(`${s.mailSubject} — ${reference ?? ""} ${a.productName ?? ""}`.trim())}&body=${encodeURIComponent(
    `${s.mailHello}\n\n${s.mailIntro} ${rec ? fmtDate(rec.deliveredAt, locale) : fmtDate(a.createdAt, locale)}${reference ? ` (${reference})` : ""} :\n${(a.items?.length ? a.items.map((x) => `- ${x.name}${x.qty != null ? ` : ${x.qty} ${x.unit}` : ""}`).join("\n") : `- ${a.productName ?? ""} : ${a.description}`)}${a.claimedAmount ? `\n- ${s.mailAmount} : ${fmtMoney(num(a.claimedAmount), locale)}` : ""}\n\n${s.mailAsk}\n\n${s.mailBye}`,
  )}`;
  const itemsLabel = a.items?.length ? a.items.map((x) => x.name).join(" · ") : a.productName ?? line?.productName ?? "";
  const stageCls: Record<string, string> = { a_traiter: "bg-red-100 text-red-800", reclamee: "bg-amber-100 text-amber-900", a_verifier: "bg-sky-100 text-sky-800", cloturee: "bg-emerald-100 text-emerald-800", annulee: "bg-stone-200 text-stone-700" };
  const fold = "group rounded-xl border border-stone-200 bg-white";
  const summary = "flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[15px] hover:bg-stone-50";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <BackLink href="/anomalies?view=liste" label={t.anomalies.title} />
        <ReviewButtons id={a.id} value={a.review ?? null} editable={can.manageAnomalies(user.role)} />
      </div>

      {/* La carte : l'essentiel, la prochaine étape et les actions */}
      <section className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
        {/* En-tête propre à la fiche d'anomalie (bandeau rouge) : ne se confond pas avec les autres fiches */}
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-rose-700 to-rose-600 px-6 py-5 text-white">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/80"><Icon name="alert" className="h-4 w-4" /> {s.title} · {fmtNo("anomaly", number)} - {fmtDate(a.createdAt ?? rec?.deliveredAt, locale)}</p>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{sentence(supplier?.name ?? a.supplierName)} — {problemType}</h1>
            {itemsLabel && problemType !== t.anomalies.types.missing_bl && problemType !== WEIGH_TYPE && <p className="text-base text-white/90">{itemsLabel}</p>}
            <div className="flex flex-col items-start gap-0.5 pt-1 text-sm">
              {rec && <Link href={`/receptions/${rec.id}`} className="font-medium text-white underline decoration-white/50 hover:decoration-white">{t.receptions.sheetLink} {fmtNo("reception", numbers.get(rec.id))}</Link>}
              {a.claimNo && <Link href={`/anomalies/reclamations?n=${a.claimNo}${claimYear ? `&y=${claimYear}` : ""}`} className="font-medium text-white underline decoration-white/50 hover:decoration-white">{t.claims.title} {fmtNo("claim", a.claimNo)}</Link>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${stageCls[a.stage] ?? "bg-stone-100"}`}>{t.stages[a.stage as "a_traiter"] ?? a.stage}</span>
{problemType !== t.anomalies.types.missing_bl && (<>
            <p className="text-3xl font-bold tabular-nums">{a.claimedAmount ? fmtMoney(num(a.claimedAmount), locale) : "—"}</p>
            <p className="text-xs text-white/80">{s.claimed}</p>
            </>)}
          </div>
        </div>
        <div className="border-t border-stone-100 p-6 pt-4">
          <ActionCard id={a.id} stage={a.stage} resolution={a.resolution} editable={editable} claimed={a.claimedAmount != null ? String(num(a.claimedAmount)).replace(".", ",") : ""} mailHref={mailHref} phone={claimPhone} supplier={sentence(supplier?.name ?? a.supplierName)} nextDate={nextDue} missingBl={problemType === t.anomalies.types.missing_bl} />
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
      <details open className={fold}>
        <summary className={summary}><span><strong>{s.problemDetail}</strong></span><span className="text-stone-400 transition group-open:rotate-90">▸</span></summary>
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
        supplier={{ id: supplier?.id ?? null, name: sentence(supplier?.name ?? a.supplierName) }}
        document={reference ? { label: reference.replace(/\s+du \d{2}\/\d{2}\/\d{2}$/, ""), href: rec ? `/receptions/${rec.id}` : null } : null}
        missingBlType={t.anomalies.types.missing_bl}
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
          docDate: a.docDate ?? docDateFallback,
        }}
      />


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
            target="_blank"
            rel="noreferrer"
            href={`${OUTLOOK_COMPOSE}?to=${encodeURIComponent(claimEmail)}&subject=${encodeURIComponent(`${s.mailSubject} — ${reference ?? ""} ${a.productName ?? ""}`.trim())}&body=${encodeURIComponent(
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
