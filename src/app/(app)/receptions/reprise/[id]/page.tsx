import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDate } from "@/lib/format";
import { fmtNo } from "@/lib/numbering";
import { receptionNumbers } from "@/lib/server/queries";
import { anomalyNumbers } from "@/lib/server/savings";
import { BackLink } from "@/components/BackLink";

/** Fiche d'un bon de reprise / retour */
export default async function ReturnSlipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { t, locale } = await getDict();
  const R = t.returnSlip;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const slip = await db.query.returnSlips.findFirst({ where: eq(schema.returnSlips.id, id) });
  if (!slip) notFound();
  const anoIds = slip.items.map((i) => i.anomalyId).filter((x): x is number => !!x);
  const [recNums, anoNums, anos, rec] = await Promise.all([
    receptionNumbers(),
    anomalyNumbers(),
    anoIds.length ? db.select({ id: schema.anomalies.id }).from(schema.anomalies).where(inArray(schema.anomalies.id, anoIds)) : Promise.resolve([]),
    slip.receptionId ? db.query.receptions.findFirst({ where: eq(schema.receptions.id, slip.receptionId), columns: { id: true, blNumber: true, deliveredAt: true } }) : Promise.resolve(undefined),
  ]);
  const alive = new Set(anos.map((a) => a.id));
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <BackLink href="/receptions" label={t.nav.receptions} />
      <section className="card overflow-hidden">
        <div className="bg-amber-500 px-4 py-3 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/85">↩ {R.badge} · {fmtNo("returnSlip", slip.seq)}</p>
          <h1 className="text-xl font-bold">{slip.supplierName} · {fmtDate(slip.date, locale)}</h1>
        </div>
        <div className="space-y-2 p-4 text-sm">
          {slip.note && <p className="text-xs text-stone-500">{slip.note}</p>}
          {rec && <p>{R.origin} : <Link href={`/receptions/${rec.id}`} className="font-medium text-brand-700 hover:underline">{fmtNo("reception", recNums.get(rec.id))}{rec.blNumber ? ` · ${rec.blNumber}` : ""} · {fmtDate(rec.deliveredAt, locale)}</Link></p>}
          <table className="table text-sm">
            <thead><tr><th>{t.common.product}</th><th className="text-right">{t.wizard.returnQty}</th><th>{t.wizard.chooseReason}</th><th>{R.anomaly}</th></tr></thead>
            <tbody>
              {slip.items.map((it, i) => (
                <tr key={i}>
                  <td className="font-medium">{it.name}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{String(it.qty).replace(".", ",")} {it.unit}</td>
                  <td>{it.reason || "—"}</td>
                  <td>{it.anomalyId && alive.has(it.anomalyId) ? <Link href={`/anomalies/${it.anomalyId}`} className="font-medium text-brand-700 hover:underline">{fmtNo("anomaly", anoNums.get(it.anomalyId)?.n)}</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
