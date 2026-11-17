import Link from "next/link";
import { asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { one, type SP } from "@/lib/server/queries";
import { exportNumber, parisDay, purgeOldExports, runDueExports, sheetValidatorIds } from "@/lib/server/sheets";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DeleteExported, ManualExport, ValidatorsPicker } from "./SheetClient";

/** Réceptions > Fiches de réception de marchandises : historique des exports (automatiques et manuels) + export manuel */
export default async function SheetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const f = t.rsheet;
  const sp = await searchParams;
  // Rattrapage : exports automatiques dus (si la tâche du soir n'est pas passée) et archivage 5 ans
  await runDueExports();
  await purgeOldExports();
  const today = parisDay();
  const d30 = new Date(Date.now() - 30 * 86_400_000);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from) ?? "") ? one(sp.from)! : parisDay(d30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to) ?? "") ? one(sp.to)! : today;
  const e = schema.receptionExports;
  const r = schema.receptions;
  const db = getDb();
  const [exports, recs, users, validators, archived] = await Promise.all([
    db.select({ e, by: schema.users.name }).from(e).leftJoin(schema.users, eq(schema.users.id, e.createdBy)).orderBy(desc(e.createdAt)).limit(2000),
    db
      .select({ id: r.id, deliveredAt: r.deliveredAt, supplierName: r.supplierName, blNumber: r.blNumber, documents: r.documents, status: r.status, consolidatedAt: r.consolidatedAt })
      .from(r)
      .where(sql`${r.deliveredAt} >= ((${from}::date)::timestamp at time zone 'Europe/Paris') and ${r.deliveredAt} < ((${to}::date + 1)::timestamp at time zone 'Europe/Paris')`)
      .orderBy(desc(r.deliveredAt))
      .limit(500),
    user.role === "admin" ? db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)) : Promise.resolve([]),
    sheetValidatorIds(),
    db.select({ n: sql<number>`count(*)::int` }).from(e).where(isNotNull(e.archivedAt)),
  ]);
  // Contenu des exports manuels : fournisseurs et jours des bons choisis
  const manualIds = [...new Set(exports.filter((x) => x.e.mode === "manual").flatMap((x) => x.e.receptionIds))];
  const manualRecs = manualIds.length ? await db.select({ id: r.id, supplierName: r.supplierName, deliveredAt: r.deliveredAt }).from(r).where(inArray(r.id, manualIds)) : [];
  const recById = new Map(manualRecs.map((x) => [x.id, x]));
  const docsOf = (x: (typeof recs)[number]) => {
    const list = (x.documents as { type: string; number: string }[] | null) ?? [];
    return list.length ? list.map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc." : "BL"} ${d.number}`).join(" · ") : x.blNumber ? `BL ${x.blNumber}` : "—";
  };
  const lastAuto = exports.find((x) => x.e.mode === "auto");

  return (
    <>
      <Link href="/receptions" className="no-print mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">← {t.nav.receptions}</Link>
      <PageHeader title={f.titleShort} />
      <p className="mb-4 max-w-4xl text-sm text-stone-600">{f.historyHint}</p>
      <p className="mb-4 text-sm font-medium text-brand-700">
        {lastAuto ? `${f.lastAuto} : N° ${exportNumber(lastAuto.e)} · ${fmtDateTime(lastAuto.e.createdAt, locale)}` : ""}{lastAuto ? " · " : ""}{f.nextAuto}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">{f.historyTitle}</h2>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>{f.number}</th><th>{f.mode}</th><th>{f.content}</th><th className="text-right">{f.receptions}</th><th className="text-right">{f.lines}</th><th>{f.createdAt}</th><th className="text-right">{f.export}</th></tr>
            </thead>
            <tbody>
              {exports.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-stone-500">{f.none}</td></tr>}
              {exports.map(({ e: x, by }) => (
                <tr key={x.id}>
                  <td className="whitespace-nowrap font-semibold"><Link className="text-brand-700 underline" href={`/receptions/fiches/${x.id}`}>{exportNumber(x)}</Link></td>
                  <td><span className={`badge ${x.mode === "manual" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{x.mode === "manual" ? f.modeManual : f.modeAuto}</span></td>
                  <td className="text-sm">
                    {x.mode === "auto" && x.day
                      ? fmtDate(x.day, locale)
                      : <span className="text-stone-700">{[...new Set(x.receptionIds.map((id) => recById.get(id)).filter(Boolean).map((rr) => `${rr!.supplierName} (${fmtDate(rr!.deliveredAt, locale)})`))].slice(0, 4).join(", ")}{x.receptionIds.length > 4 ? "…" : ""}</span>}
                    {x.archivedAt && <span className="block text-xs text-stone-400">{f.exported} {fmtDate(x.archivedAt, locale)}</span>}
                  </td>
                  <td className="text-right tabular-nums">{x.receptionCount}</td>
                  <td className="text-right tabular-nums">{x.lineCount}</td>
                  <td className="whitespace-nowrap text-sm">{fmtDateTime(x.createdAt, locale)}<span className="block text-xs text-stone-500">{by ?? f.system}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <a className="btn-ghost px-2 py-1 text-xs" href={`/api/fiches/${x.id}?format=pdf`}><Icon name="download" className="h-3.5 w-3.5" /> {f.pdf}</a>
                    <a className="btn-ghost px-2 py-1 text-xs" href={`/api/fiches/${x.id}?format=xlsx`}><Icon name="download" className="h-3.5 w-3.5" /> {f.excel}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mb-6 p-4">
        <h2 className="font-semibold">{f.manualTitle}</h2>
        <p className="mb-3 text-xs text-stone-500">{f.manualHint}</p>
        <form method="get" className="mb-3 flex flex-wrap items-end gap-3">
          <label><span className="label">{t.common.from}</span><input type="date" name="from" defaultValue={from} className="input py-2" /></label>
          <label><span className="label">{t.common.to}</span><input type="date" name="to" defaultValue={to} className="input py-2" /></label>
          <button className="btn-secondary py-2">{t.common.apply}</button>
        </form>
        <ManualExport
          rows={recs.map((x) => ({ id: x.id, date: fmtDateTime(x.deliveredAt, locale), supplier: x.supplierName, docs: docsOf(x), status: t.receptionStatus[x.status], consolidated: !!x.consolidatedAt }))}
        />
      </section>

      {user.role === "admin" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="font-semibold">{f.responsibles}</h2>
            <p className="mb-3 text-xs text-stone-500">{f.responsiblesHint}</p>
            <ValidatorsPicker users={users} selected={validators} />
          </section>
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">{f.archive}</h2>
            <p className="text-xs text-stone-500">{f.archiveHint}</p>
            <div className="flex flex-wrap items-center gap-2">
              <a className="btn-secondary" href="/api/fiches/export"><Icon name="download" className="h-4 w-4" /> {f.exportAll}</a>
              <DeleteExported count={archived[0].n} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
