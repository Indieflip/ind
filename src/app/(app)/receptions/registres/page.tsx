import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { periodLabel } from "@/lib/server/haccpPeriod";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";

/** Réceptions > Historique des registres HACCP générés */
export default async function RegistersPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const h = t.haccpReg;
  const r = schema.haccpRegisters;
  const rows = await getDb()
    .select({ id: r.id, fromDate: r.fromDate, toDate: r.toDate, receptionCount: r.receptionCount, lineCount: r.lineCount, createdAt: r.createdAt, by: schema.users.name })
    .from(r)
    .leftJoin(schema.users, eq(schema.users.id, r.createdBy))
    .orderBy(desc(r.id))
    .limit(1000);
  return (
    <>
      <Link href="/receptions" className="no-print mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">← {h.back}</Link>
      <PageHeader title={`${t.reporting.haccp} · ${h.history}`} />
      <p className="mb-4 text-sm text-stone-600">{h.historyIntro}</p>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{h.number}</th>
              <th>{h.createdAt}</th>
              <th>{h.period}</th>
              <th className="text-right">{h.receptions}</th>
              <th className="text-right">{h.linesCol}</th>
              <th className="text-right">{h.download}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-stone-500">{h.none}</td></tr>}
            {rows.map((x) => (
              <tr key={x.id}>
                <td className="font-semibold tabular-nums">{x.id}</td>
                <td className="whitespace-nowrap">{fmtDateTime(x.createdAt, locale)}{x.by && <span className="block text-xs text-stone-500">{h.by} {x.by}</span>}</td>
                <td>{periodLabel(x.fromDate ?? undefined, x.toDate ?? undefined, user.locale)}</td>
                <td className="text-right tabular-nums">{x.receptionCount}</td>
                <td className="text-right tabular-nums">{x.lineCount}</td>
                <td className="whitespace-nowrap text-right">
                  <a className="btn-ghost px-2 py-1 text-xs" href={`/api/haccp/${x.id}?format=pdf`}><Icon name="download" className="h-3.5 w-3.5" /> {h.pdf}</a>
                  <a className="btn-ghost px-2 py-1 text-xs" href={`/api/haccp/${x.id}?format=xlsx`}><Icon name="download" className="h-3.5 w-3.5" /> {h.excel}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
