import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, num, sentence } from "@/lib/format";
import { isSupplierCreation } from "@/lib/majKinds";
import { fvRange, parisMonth } from "@/lib/pricing";
import { one, type SP } from "@/lib/server/queries";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/DecisionBadge";
import { anomalyNumbers } from "@/lib/server/savings";
import { ensureSupplierProcesses } from "@/lib/server/followup";
import { stageOf } from "@/lib/anomaly";
import { SupplierAnomalies, SupplierInfo, SupplierReceptions, SupplierSearch, DeleteSupplier } from "../SupplierClient";
import { AddRow, MercurialTable } from "../../MercurialClient";
import { productUpdatedAt } from "@/lib/server/productUpdates";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await ensureSupplierProcesses();
  const user = await requireUser(can.viewSuppliers);
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const tabParam = one((await searchParams).tab);
  const tab = tabParam === "anomalies" ? "anomalies" : tabParam === "receptions" ? "receptions" : "products";
  const editInfo = one((await searchParams).edit) === "1";
  const db = getDb();
  const supplier = Number.isInteger(id) ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) }) : undefined;
  if (!supplier) notFound();
  const [products, cats, recents, unitRows, supplierAnomalies, allSuppliers, fvItems] = await Promise.all([
    db.select({ p: schema.products, updated: productUpdatedAt }).from(schema.products).where(eq(schema.products.supplierId, id)).orderBy(asc(schema.products.name)).then((r) => r.map((x) => ({ ...x.p, updated: x.updated }))),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    db
      .select({
        id: schema.receptions.id, deliveredAt: schema.receptions.deliveredAt, blNumber: schema.receptions.blNumber, status: schema.receptions.status,
        consolidatedAt: schema.receptions.consolidatedAt, author: schema.users.name,
        lines: sql<number>`(select count(*)::int from reception_lines l where l.reception_id = "receptions"."id")`,
      })
      .from(schema.receptions)
      .leftJoin(schema.users, eq(schema.users.id, schema.receptions.createdBy))
      .where(eq(schema.receptions.supplierId, id))
      .orderBy(desc(schema.receptions.deliveredAt)),
    db.select({ name: schema.units.name }).from(schema.units).orderBy(asc(schema.units.position), asc(schema.units.name)),
    db.select().from(schema.anomalies).where(eq(schema.anomalies.supplierId, id)).orderBy(desc(schema.anomalies.createdAt)),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name)),
    db.select().from(schema.fvItems),
  ]);
  // Date de création du compte : la plus ancienne entre l'ajout dans l'application et une ligne « Rajout fournisseur / prestataire » de l'historique du Mercurial
  const majRows = await db.select({ date: schema.majLog.date, nature: schema.majLog.nature, item: schema.majLog.item, detail: schema.majLog.detail }).from(schema.majLog).where(eq(schema.majLog.supplierId, id));
  const creations = majRows.filter((r) => r.date && isSupplierCreation(r.nature, r.item, r.detail)).map((r) => new Date(`${r.date}T12:00:00`));
  const createdOn = [supplier.createdAt, ...creations].sort((a, b) => a.getTime() - b.getTime())[0];
  const units = unitRows.map((u) => u.name);
  const categories = cats.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr }));
  const editable = can.editSuppliers(user.role);
  const month = parisMonth(new Date());
  const fvById = new Map(fvItems.map((f) => [f.id, f]));
  // Même tableau que Mercurial > Produits : une modification ici est la même que là-bas
  const rows = products.map((p) => {
    const fv = p.fvItemId ? fvById.get(p.fvItemId) : undefined;
    const range = fv ? fvRange(fv.prices, month) : { min: num(p.priceMin), max: num(p.price) };
    return {
      id: p.id, supplierId: p.supplierId, supplier: supplier.name, nature: p.nature, name: p.name, unit: p.unit,
      priceMin: range.min, price: range.max, priceLocked: fv ? fv.locked : p.priceLocked, active: p.active, fv: !!fv, updated: p.updated,
    };
  });
  const natures = [...new Set(rows.flatMap((r) => (r.nature ?? "").split(/,\s*/).filter(Boolean)))].sort((a, b) => a.localeCompare(b, "fr"));
  const numbers = await anomalyNumbers();
  const contactCards = (["societe", "commande", "reclamation"] as const).map((kind) => {
    const c = supplier.contacts?.[kind] ?? (kind === "societe" ? { email: supplier.email ?? "", phone: supplier.phone ?? "", notes: supplier.notes ?? "" } : {});
    return { kind, email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "", extra: (("extra" in c && c.extra) || []).filter((x) => x.value) };
  }).filter((c) => c.email || c.phone || c.notes || c.extra.length);
  const natureMap = new Map<string, number>();
  for (const r of rows) if (r.active) for (const n of (r.nature ?? "").split(/,\s*/).filter(Boolean)) natureMap.set(n, (natureMap.get(n) ?? 0) + 1);
  const natureCounts = [...natureMap.entries()].sort((a, b) => b[1] - a[1]);
  const openAnomalies = supplierAnomalies.filter((a) => a.stage === "a_traiter" || a.stage === "reclamee" || a.stage === "a_verifier").length;
  const tabCls = (on: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${on ? "border-brand-600 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/mercurial/fournisseurs" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.suppliers.title}</Link>
        <div className="w-full max-w-xs"><SupplierSearch suppliers={allSuppliers} /></div>
      </div>
      {/* Récap du fournisseur : identité, coordonnées, natures des produits, chiffres */}
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold">{sentence(supplier.name).charAt(0)}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">N° {supplier.id}{!supplier.active ? ` · ${t.suppliers.inactive}` : ""}</p>
              <h1 className="text-2xl font-bold leading-tight">{sentence(supplier.name)}</h1>
              <p className="text-sm text-white/75">{t.maj.accountCreated} {fmtDate(createdOn, locale)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && <Link href={editInfo ? `/mercurial/fournisseurs/${id}` : `/mercurial/fournisseurs/${id}?edit=1#infos`} className="btn bg-white/15 text-white hover:bg-white/25"><Icon name="edit" className="h-4 w-4" /> {editInfo ? t.common.close : t.suppliers.editInfo}</Link>}
          </div>
        </div>
        <div className="grid gap-px bg-stone-200 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="bg-white p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-stone-400">{t.suppliers.contacts}</p>
            <div className="space-y-2.5">
              {contactCards.length ? contactCards.map((c) => (
                <div key={c.kind} className="text-sm">
                  <p className="font-semibold text-stone-700">{t.suppliers.contactKinds[c.kind]}</p>
                  {c.email && <a href={`mailto:${c.email}`} className="block truncate text-brand-700 hover:underline">✉ {c.email}</a>}
                  {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="block text-brand-700 hover:underline">☎ {c.phone}</a>}
                  {c.extra.map((x, i) => <p key={i} className="text-stone-600">{x.label} : {x.value}</p>)}
                  {c.notes && <p className="text-xs text-stone-500">{c.notes}</p>}
                </div>
              )) : <p className="text-sm text-stone-400">{t.suppliers.noContact}</p>}
            </div>
          </div>
          <div className="bg-white p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-stone-400">{t.suppliers.natures}</p>
            {natureCounts.length ? (
              <div className="flex flex-wrap gap-1.5">{natureCounts.map(([n, c]) => <span key={n} className="badge bg-brand-50 text-brand-800">{n} <span className="ml-1 text-brand-600/70">{c}</span></span>)}</div>
            ) : <p className="text-sm text-stone-400">—</p>}
          </div>
          <div className="grid grid-cols-2 gap-px bg-stone-200">
            {([[t.mercurial.tabProducts, String(rows.filter((r) => r.active).length)], [t.nav.receptions, String(recents.length)], [t.suppliers.lastReception, recents[0] ? fmtDate(recents[0].deliveredAt, locale) : "—"], [t.suppliers.openAnomalies, String(openAnomalies)]] as const).map(([k, v]) => (
              <div key={k} className="bg-white p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">{k}</p>
                <p className="text-lg font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="-mt-2 flex justify-end">
        {can.deleteSupplier(user.role) ? (
          <DeleteSupplier id={supplier.id} name={supplier.name} others={allSuppliers} />
        ) : (
          <Link className="btn-ghost text-sm text-stone-600" href={`/demandes?subject=${encodeURIComponent(`${t.suppliers.askDelete} : ${supplier.name}`)}&url=${encodeURIComponent(`/mercurial/fournisseurs/${supplier.id}`)}`}>
            <Icon name="inbox" className="h-4 w-4" /> {t.suppliers.askDelete}
          </Link>
        )}
      </div>
      {/* Process de réclamation du fournisseur : toujours visible dans son compte */}
      {supplier.claimProcess && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="mb-1 font-semibold">⚠ {t.suppliers.claimProcess}</h2>
          <ul className="list-inside list-disc space-y-0.5">
            {supplier.claimProcess.split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter((l) => l && !l.endsWith(":")).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>
      )}
      <nav className="flex gap-1 border-b border-stone-200">
        <Link href={`/mercurial/fournisseurs/${id}`} className={tabCls(tab === "products")}>{t.mercurial.tabProducts} ({rows.filter((r) => r.active).length})</Link>
        <Link href={`/mercurial/fournisseurs/${id}?tab=receptions`} className={tabCls(tab === "receptions")}>{t.nav.receptions} ({recents.length})</Link>
        <Link href={`/mercurial/fournisseurs/${id}?tab=anomalies`} className={tabCls(tab === "anomalies")}>{t.nav.anomalies} ({openAnomalies})</Link>
      </nav>

      {tab === "products" ? (
        <>
          {editable && editInfo && (
            <div id="infos" className="scroll-mt-4"><SupplierInfo
              id={supplier.id}
              name={supplier.name}
              active={supplier.active}
              claimProcess={supplier.claimProcess ?? ""}
              contacts={Object.fromEntries((["societe", "reclamation", "commande"] as const).map((k) => {
                const c = supplier.contacts?.[k] ?? (k === "societe" ? { email: supplier.email ?? "", phone: supplier.phone ?? "", notes: supplier.notes ?? "" } : {});
                return [k, { email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "", extra: ("extra" in c && c.extra) || [] }];
              })) as Record<"societe" | "reclamation" | "commande", { email: string; phone: string; notes: string; extra: { label: string; value: string }[] }>}
            /></div>
          )}
          {editable && <AddRow suppliers={allSuppliers} units={units} natures={natures} fixedSupplier={{ id: supplier.id, name: supplier.name }} existing={rows.filter((r) => r.active).map((r) => ({ supplierId: r.supplierId, name: r.name }))} />}
          <h2 className="pt-2 text-lg font-semibold">{t.suppliers.productList}</h2>
          <MercurialTable rows={rows} suppliers={allSuppliers} units={units} natures={natures} editable={editable} />
        </>
      ) : tab === "receptions" ? (
        <SupplierReceptions
          rows={recents.map((r) => ({
            id: r.id, blNumber: r.blNumber, date: fmtDateTime(r.deliveredAt, locale), dateSort: r.deliveredAt.toISOString(),
            lines: r.lines, status: r.status, statusLabel: t.receptionStatus[r.status], consolidated: !!r.consolidatedAt, author: r.author,
          }))}
        />
      ) : (
        <SupplierAnomalies
          supplierId={supplier.id}
          rows={supplierAnomalies.map((a) => ({
            id: a.id, number: numbers.get(a.id)?.n ?? null, numberFinal: !!numbers.get(a.id)?.final, stageLabel: t.stages[stageOf(a.stage)], stage: a.stage, date: fmtDateTime(a.createdAt, locale), dateSort: a.createdAt.toISOString(),
            type: t.anomalies.types[a.type], product: a.productName ?? "", description: a.description,
            status: a.status, statusLabel: t.anomalies.statuses[a.status], receptionId: a.receptionId,
          }))}
        />
      )}
    </div>
  );
}
