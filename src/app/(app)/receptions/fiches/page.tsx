import Link from "next/link";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { backfillSheets, parisDay, purgeOldSheets, sheetNumber, sheetValidatorIds } from "@/lib/server/sheets";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DeleteExported, ValidatorsPicker } from "./SheetClient";

const statusStyle: Record<string, string> = { pending: "bg-amber-100 text-amber-900", validated: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-800" };

/** Réceptions > Fiches de réception de marchandises : historique, fiche du jour, responsables, archivage */
export default async function SheetsPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const f = t.rsheet;
  await purgeOldSheets();
  await backfillSheets();
  const today = parisDay();
  const s = schema.receptionSheets;
  const v = schema.receptionSheetVersions;
  const db = getDb();
  const [sheets, versions, users, validators, exported] = await Promise.all([
    db.select().from(s).orderBy(desc(s.date)).limit(2000),
    db.select({ sheetId: v.sheetId, version: v.version, status: v.status, lineCount: v.lineCount, receptionCount: v.receptionCount, reviewedAt: v.reviewedAt }).from(v).orderBy(asc(v.version)),
    user.role === "admin" ? db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name)) : Promise.resolve([]),
    sheetValidatorIds(),
    db.select({ n: sql<number>`count(*)::int` }).from(s).where(isNotNull(s.exportedAt)),
  ]);
  const byId = new Map<number, typeof versions>();
  for (const x of versions) byId.set(x.sheetId, [...(byId.get(x.sheetId) ?? []), x]);
  const todaySheet = sheets.find((x) => x.date === today);

  return (
    <>
      <Link href="/receptions" className="no-print mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">← {t.nav.receptions}</Link>
      <PageHeader title={f.titleShort}>
        {todaySheet ? <Link href={`/receptions/fiches/${todaySheet.id}`} className="btn-primary"><Icon name="file" className="h-4 w-4" /> {f.openToday}</Link> : <span className="text-sm text-stone-500">{f.noToday}</span>}
      </PageHeader>
      <p className="mb-1 max-w-4xl text-sm text-stone-600">{f.intro}</p>
      <p className="mb-4 max-w-4xl text-sm font-medium text-brand-700">{f.autoHint}</p>

      <div className="card mb-6 overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>{f.number}</th><th>{f.date}</th><th>{f.status}</th><th className="text-right">{f.receptions}</th><th className="text-right">{f.lines}</th><th>{f.lastValidated}</th><th className="text-right">{f.export}</th></tr>
          </thead>
          <tbody>
            {sheets.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-stone-500">{f.none}</td></tr>}
            {sheets.map((x) => {
              const vs = byId.get(x.id) ?? [];
              const last = vs[vs.length - 1];
              const valid = [...vs].reverse().find((y) => y.status === "validated");
              return (
                <tr key={x.id}>
                  <td className="whitespace-nowrap font-semibold"><Link className="text-brand-700 underline" href={`/receptions/fiches/${x.id}`}>{sheetNumber(x)}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(x.date, locale)}</td>
                  <td>{last && <span className={`badge ${statusStyle[last.status]}`}>{f.statuses[last.status as "pending"]}{last.version > 1 ? ` · V${last.version}` : ""}</span>}</td>
                  <td className="text-right tabular-nums">{last?.receptionCount ?? 0}</td>
                  <td className="text-right tabular-nums">{last?.lineCount ?? 0}</td>
                  <td className="text-sm">{valid ? `V${valid.version} · ${fmtDateTime(valid.reviewedAt!, locale)}` : <span className="text-stone-400">—</span>}{x.exportedAt && <span className="block text-xs text-stone-400">{f.exported} {fmtDate(x.exportedAt, locale)}</span>}</td>
                  <td className="whitespace-nowrap text-right">
                    {valid ? (
                      <>
                        <a className="btn-ghost px-2 py-1 text-xs" href={`/api/fiches/${x.id}?format=pdf`}><Icon name="download" className="h-3.5 w-3.5" /> {f.pdf}</a>
                        <a className="btn-ghost px-2 py-1 text-xs" href={`/api/fiches/${x.id}?format=xlsx`}><Icon name="download" className="h-3.5 w-3.5" /> {f.excel}</a>
                      </>
                    ) : <span className="text-xs text-stone-400">{f.statuses.pending}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
              <DeleteExported count={exported[0].n} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
