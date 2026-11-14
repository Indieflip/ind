import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtPct, num } from "@/lib/format";
import { priceDiffPct } from "@/lib/rules";
import { StatusBadge, decisionStyles } from "@/components/DecisionBadge";
import { Icon } from "@/components/Icon";
import { PrintButton, DeleteReceptionButton } from "./Actions";

export default async function ReceptionDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id) });
  if (!rec) notFound();
  const [lines, photos, categories, author] = await Promise.all([
    db.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id)).orderBy(asc(schema.receptionLines.position)),
    db.select().from(schema.receptionPhotos).where(eq(schema.receptionPhotos.receptionId, id)),
    db.select().from(schema.categories),
    rec.createdBy ? db.query.users.findFirst({ where: eq(schema.users.id, rec.createdBy), columns: { name: true } }) : undefined,
  ]);
  const editor = rec.updatedBy ? await db.query.users.findFirst({ where: eq(schema.users.id, rec.updatedBy), columns: { name: true } }) : undefined;
  // Montant HT accepté : quantité reçue × prix, hors produits refusés
  const total = lines.reduce((sum, l) => (l.decision === "refuse" ? sum : sum + (num(l.qtyReceived) ?? 0) * (num(l.unitPrice) ?? 0)), 0);
  const catName = (cid: number | null) => {
    const c = categories.find((x) => x.id === cid);
    return c ? (locale === "en" ? c.nameEn : c.nameFr) : "—";
  };
  const blPhotos = photos.filter((p) => p.kind === "bl");
  const showPrices = can.viewPrices(user.role) || can.receive(user.role);

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-2">
        <Link href="/receptions" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.nav.receptions}</Link>
        <div className="flex flex-wrap justify-end gap-2">
          {can.editReception(user.role) && (
            <Link href={`/receptions/${rec.id}/edit`} className="btn-primary"><Icon name="edit" className="h-4 w-4" /> {t.receptions.edit}</Link>
          )}
          {can.consolidate(user.role) && (
            <Link href={`/consolidation?ids=${rec.id}`} className="btn-secondary"><Icon name="layers" className="h-4 w-4" /> {t.receptions.consolidate}</Link>
          )}
          <PrintButton label={t.common.print} />
          {can.deleteReception(user.role) && <DeleteReceptionButton id={rec.id} label={t.common.delete} confirmText={`${t.receptions.deleteHint}\n\n${t.common.confirmDelete}`} />}
        </div>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-stone-500">{t.receptions.detail}</p>
            <h1 className="text-2xl font-bold">{rec.supplierName}</h1>
            <p className="text-sm text-stone-600">{fmtDateTime(rec.deliveredAt, locale)}</p>
          </div>
          <StatusBadge status={rec.status} label={t.receptionStatus[rec.status]} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-stone-500">{t.receptions.bl}</dt><dd className="font-medium">{rec.blNumber ?? "—"}</dd></div>
          <div><dt className="text-stone-500">{t.receptions.driver}</dt><dd className="font-medium">{rec.driverName ?? "—"}</dd></div>
          <div><dt className="text-stone-500">{t.receptions.truckTemp}</dt><dd className="font-medium">{rec.truckTemp != null ? `${fmtNum(rec.truckTemp, locale, 1)} °C` : "—"}</dd></div>
          <div><dt className="text-stone-500">{t.receptions.vehicleClean}</dt><dd className="font-medium">{rec.vehicleClean == null ? "—" : rec.vehicleClean ? t.common.yes : t.common.no}</dd></div>
          <div><dt className="text-stone-500">{t.receptions.createdBy}</dt><dd className="font-medium">{author?.name ?? "—"}</dd></div>
          {rec.updatedAt && (
            <div><dt className="text-stone-500">{t.receptions.editedOn}</dt><dd className="font-medium">{fmtDateTime(rec.updatedAt, locale)}{editor ? ` ${t.receptions.editedBy} ${editor.name}` : ""}</dd></div>
          )}
          {showPrices && total > 0 && (
            <div><dt className="text-stone-500">{t.receptions.total}</dt><dd className="font-semibold">{fmtMoney(total, locale)}</dd></div>
          )}
        </dl>
      </section>

      {/* Mobile : une carte par produit */}
      <ul className="space-y-2 md:hidden print:hidden">
        {lines.map((l) => {
          const gap = priceDiffPct(num(l.unitPrice), num(l.mercurialPrice));
          return (
            <li key={l.id} className={`card border-l-4 ${decisionStyles[l.decision].border} p-3 text-sm`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{l.productName}</span>
                <span className={`badge ${decisionStyles[l.decision].badge}`}>{t.decision[l.decision]}</span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                <div><dt className="text-stone-500">{t.wizard.ordered}</dt><dd>{fmtNum(l.qtyOrdered, locale)} {l.unit}</dd></div>
                <div><dt className="text-stone-500">{t.wizard.received}</dt><dd>{fmtNum(l.qtyReceived, locale)} {l.unit}</dd></div>
                <div><dt className="text-stone-500">{t.wizard.temperature}</dt><dd>{l.temperature != null ? `${fmtNum(l.temperature, locale, 1)} °C` : "—"}</dd></div>
                <div><dt className="text-stone-500">{t.wizard.dlc}</dt><dd>{fmtDate(l.dlc, locale)}</dd></div>
                <div><dt className="text-stone-500">{t.wizard.lot}</dt><dd>{l.lot ?? "—"}</dd></div>
                {showPrices && (
                  <div><dt className="text-stone-500">{t.common.price}</dt><dd>{fmtMoney(l.unitPrice, locale)}{gap ? <span className={gap > 0 ? " text-red-600" : " text-emerald-600"}> {fmtPct(gap)}</span> : null}</dd></div>
                )}
              </dl>
              {l.reason && <p className="mt-1 text-xs text-stone-600">{(t.reasons as Record<string, string>)[l.reason] ?? l.reason}</p>}
              <div className="mt-1 flex gap-2">
                {photos.filter((p) => p.lineId === l.id).map((p) => (
                  <a key={p.id} href={p.url} target="_blank"><img src={p.url} alt="" className="h-14 w-14 rounded object-cover" /></a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="card hidden overflow-x-auto md:block print:block">
        <table className="table">
          <thead>
            <tr>
              <th>{t.common.product}</th>
              <th>{t.common.category}</th>
              <th className="text-right">{t.wizard.ordered}</th>
              <th className="text-right">{t.wizard.received}</th>
              <th className="text-right">{t.wizard.temperature}</th>
              <th>{t.wizard.dlc}</th>
              <th>{t.wizard.lot}</th>
              {showPrices && <th className="text-right">{t.wizard.unitPrice}</th>}
              <th>{t.common.status}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const gap = priceDiffPct(num(l.unitPrice), num(l.mercurialPrice));
              const linePhotos = photos.filter((p) => p.lineId === l.id);
              return (
                <tr key={l.id} className={`border-l-4 ${decisionStyles[l.decision].border}`}>
                  <td className="font-medium">{l.productName}</td>
                  <td className="text-stone-500">{catName(l.categoryId)}</td>
                  <td className="text-right tabular-nums">{fmtNum(l.qtyOrdered, locale)} {l.qtyOrdered ? l.unit : ""}</td>
                  <td className="text-right tabular-nums">{fmtNum(l.qtyReceived, locale)} {l.qtyReceived ? l.unit : ""}</td>
                  <td className="text-right tabular-nums">{l.temperature != null ? `${fmtNum(l.temperature, locale, 1)} °C` : "—"}</td>
                  <td>{fmtDate(l.dlc, locale)}</td>
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

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">{t.receptions.reservesText}</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700">{rec.reservesText || t.wizard.noReserves}</pre>
        </section>
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">{t.receptions.signature}</h2>
          {rec.signatureUrl ? <img src={rec.signatureUrl} alt="" className="h-32 rounded border border-stone-200 bg-white" /> : <p className="text-sm text-stone-500">—</p>}
          {rec.signerName && <p className="mt-1 text-sm">{rec.signerName}</p>}
        </section>
      </div>

      {blPhotos.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">{t.receptions.blPhotos}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {blPhotos.map((p) => (
              <a key={p.id} href={p.url} target="_blank"><img src={p.url} alt="" className="w-full rounded-lg border border-stone-200" /></a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
