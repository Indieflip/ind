import { fmtNo } from "@/lib/numbering";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtMoney, fmtNum, num, sentence } from "@/lib/format";
import { fvRange, parisMonth } from "@/lib/pricing";
import { Icon } from "@/components/Icon";
import { MajLog } from "../../mise-a-jour/MajLog";
import { ProductEditor } from "./ProductEditor";

type Event = { at: Date; icon: string; tone: string; title: string; text: string; href?: string };

/** Fiche produit du Mercurial : identité, chiffres, historique (création, prix, mises à jour, anomalies) et dernières réceptions */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(can.viewMercurial);
  const { t, locale } = await getDict();
  const P = t.productPage;
  const id = Number((await params).id);
  const db = getDb();
  const product = Number.isInteger(id) ? await db.query.products.findFirst({ where: eq(schema.products.id, id) }) : undefined;
  if (!product) notFound();
  const l = schema.receptionLines;
  const r = schema.receptions;
  const [supplier, category, fv, changes, maj, lines, anomalies] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, product.supplierId) }),
    product.categoryId ? db.query.categories.findFirst({ where: eq(schema.categories.id, product.categoryId) }) : Promise.resolve(undefined),
    product.fvItemId ? db.query.fvItems.findFirst({ where: eq(schema.fvItems.id, product.fvItemId) }) : Promise.resolve(undefined),
    db.select().from(schema.priceChanges).where(eq(schema.priceChanges.productId, id)).orderBy(desc(schema.priceChanges.date)),
    db.select().from(schema.majLog).where(eq(schema.majLog.productId, id)).orderBy(desc(schema.majLog.date), desc(schema.majLog.createdAt)),
    db
      .select({ id: l.id, receptionId: r.id, deliveredAt: r.deliveredAt, blNumber: r.blNumber, document: l.document, unit: l.unit, qtyOrdered: l.qtyOrdered, qtyReceived: l.qtyReceived, unitPrice: l.unitPrice, decision: l.decision })
      .from(l)
      .innerJoin(r, eq(r.id, l.receptionId))
      .where(eq(l.productId, id))
      .orderBy(desc(r.deliveredAt)),
    // Anomalies du produit : produit principal, produits de la fiche (écarts de pesée compris) ou ligne du bon
    db
      .select({ id: schema.anomalies.id, createdAt: schema.anomalies.createdAt, type: schema.anomalies.type, problemType: schema.anomalies.problemType, description: schema.anomalies.description, stage: schema.anomalies.stage })
      .from(schema.anomalies)
      .leftJoin(l, eq(l.id, schema.anomalies.lineId))
      .where(sql`${schema.anomalies.productId} = ${id} or ${l.productId} = ${id} or ${schema.anomalies.items} @> ${JSON.stringify([{ productId: id }])}::jsonb`)
      .orderBy(desc(schema.anomalies.createdAt)),
  ]);

  const [unitRows, natureRows] = await Promise.all([
    db.select({ name: schema.units.name }).from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
    db.selectDistinct({ nature: schema.products.nature }).from(schema.products),
  ]);
  const natureList = [...new Set(natureRows.flatMap((x) => (x.nature ?? "").split(/,\s*/).filter(Boolean)))].sort((a, b) => a.localeCompare(b, "fr"));
  const money = (n: number | null) => (n != null ? fmtMoney(n, locale) : "—");
  const range = fv ? fvRange(fv.prices, parisMonth(new Date())) : { min: num(product.priceMin), max: num(product.price) };
  const locked = fv ? fv.locked : product.priceLocked;
  const lastPrice = lines.find((x) => num(x.unitPrice) != null);

  // Historique : du plus récent au plus ancien
  const events: Event[] = [
    { at: product.createdAt, icon: "plus", tone: "bg-brand-100 text-brand-700", title: P.evCreated, text: [supplier ? sentence(supplier.name) : "", product.unit].filter(Boolean).join(" · ") },
    ...changes.map((c) => ({
      at: c.date,
      icon: "euro",
      tone: c.type === "increase" ? "bg-red-100 text-red-700" : c.type === "decrease" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700",
      title: c.type === "increase" ? P.evIncrease : c.type === "decrease" ? P.evDecrease : P.evNew,
      text: `${num(c.oldPrice) != null ? `${money(num(c.oldPrice))} → ` : ""}${money(num(c.newPrice))}${c.pct != null ? ` (${c.pct > 0 ? "+" : ""}${fmtNum(c.pct, locale, 1)} %)` : ""} · ${P.src[c.source]}${c.invoiceRef ? ` ${c.invoiceRef}` : ""}`,
      href: c.receptionId ? `/receptions/${c.receptionId}` : undefined,
    })),
    ...anomalies.map((a) => ({ at: a.createdAt, icon: "alert", tone: "bg-rose-100 text-rose-700", title: `${P.evAnomaly} · ${a.problemType || (t.anomalies.types[a.type as keyof typeof t.anomalies.types] ?? a.type)}`, text: `${a.description} · ${t.stages[a.stage as keyof typeof t.stages] ?? a.stage}`, href: `/anomalies/${a.id}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const info = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-stone-100 py-2 text-sm last:border-b-0">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
  const tile = (k: string, v: string, hint?: string) => (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">{k}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{v}</p>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <Link href="/mercurial" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {P.back}</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold"><span className="mr-2 align-middle text-sm font-semibold text-stone-400">{fmtNo("product", product.id)}</span>{product.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {supplier && <Link href={`/mercurial/fournisseurs/${supplier.id}`} className="font-medium text-brand-700 hover:underline">{sentence(supplier.name)}</Link>}
            {locked && <span className="badge bg-sky-100 text-sky-800">🔒 {P.locked}</span>}
            {fv && <span className="badge bg-lime-100 text-lime-800">{P.fv}</span>}
            {!product.active && <span className="badge bg-stone-200 text-stone-700">{P.inactive}</span>}
          </div>
        </div>
        {can.editMercurial(user.role) && (
          <ProductEditor
            fv={!!fv}
            units={unitRows.map((u) => u.name)}
            natures={natureList}
            product={{ id: product.id, name: product.name, unit: product.unit, nature: product.nature, priceMin: num(product.priceMin), price: num(product.price), priceLocked: product.priceLocked, active: product.active }}
          />
        )}
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tile(P.range, range.min != null && range.max != null && range.min !== range.max ? `${money(range.min)} – ${money(range.max)}` : money(range.max ?? range.min), product.unit)}
        {tile(P.lastPrice, lastPrice ? money(num(lastPrice.unitPrice)) : "—", lastPrice ? fmtDate(lastPrice.deliveredAt, locale) : undefined)}
        {tile(P.receptions, String(new Set(lines.map((x) => x.receptionId)).size))}
        {tile(P.anomalies, String(anomalies.length), `${changes.length} ${P.priceChanges.toLowerCase()}`)}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[20rem_1fr]">
        <section className="card p-4">
          <dl>
            {info(P.supplier, supplier ? sentence(supplier.name) : "—")}
            {info(P.category, category ? (locale === "en" ? category.nameEn : category.nameFr) : "—")}
            {info(P.nature, product.nature || "—")}
            {info(P.service, product.service || "—")}
            {info(P.unit, product.unit)}
            {info(P.created, fmtDate(product.createdAt, locale))}
          </dl>
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="font-semibold">{P.history}</h2>
          <p className="mb-4 text-xs text-stone-500">{P.historyHint}</p>
          <ol className="space-y-0">
            {events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${e.tone}`}><Icon name={e.icon} className="h-4 w-4" /></span>
                  {i < events.length - 1 && <span className="w-px flex-1 bg-stone-200" />}
                </div>
                <div className={`min-w-0 flex-1 ${i < events.length - 1 ? "pb-4" : ""}`}>
                  <p className="text-xs text-stone-400">{fmtDate(e.at, locale)}</p>
                  <p className="text-sm font-semibold">{e.href ? <Link href={e.href} className="hover:text-brand-700 hover:underline">{e.title}</Link> : e.title}</p>
                  {e.text && <p className="text-sm text-stone-600">{e.text}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section>
        <h2 className="font-semibold">{t.maj.productHistory}</h2>
        <p className="mb-2 text-xs text-stone-500">{t.maj.productHistoryHint}</p>
        <MajLog
          compact
          editable={can.editPrices(user.role)}
          rows={maj.map((r) => ({ id: r.id, date: r.date, nature: r.nature, item: product.name, original: null, detail: r.detail, supplier: null, supplierId: r.supplierId, reference: r.reference, claim: r.claim, priceHref: null }))}
        />
      </section>

      <section className="card overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">{P.lastReceptions}</h2>
        {lines.length ? (
          <div className="overflow-x-auto">
            <table className="table mt-2 text-sm">
              <thead><tr><th>{P.date}</th><th>{P.doc}</th><th className="text-right">{P.qtyInvoiced}</th><th className="text-right">{P.qtyChecked}</th><th className="text-right">{P.price}</th><th>{P.decision}</th></tr></thead>
              <tbody>
                {lines.slice(0, 30).map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap"><Link href={`/receptions/${x.receptionId}`} className="text-brand-700 hover:underline">{fmtDate(x.deliveredAt, locale)}</Link></td>
                    <td>{x.document || x.blNumber || "—"}</td>
                    <td className="text-right tabular-nums">{num(x.qtyOrdered) != null ? `${fmtNum(num(x.qtyOrdered)!, locale)} ${x.unit ?? ""}` : "—"}</td>
                    <td className="text-right tabular-nums">{num(x.qtyReceived) != null ? `${fmtNum(num(x.qtyReceived)!, locale)} ${x.unit ?? ""}` : "—"}</td>
                    <td className="text-right tabular-nums">{money(num(x.unitPrice))}</td>
                    <td>{x.decision === "refuse" ? <span className="badge bg-red-100 text-red-800">{t.decision.refuse}</span> : <span className="badge bg-emerald-100 text-emerald-800">{t.wizard.accepted}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-stone-500">{P.none}</p>
        )}
      </section>
    </div>
  );
}
