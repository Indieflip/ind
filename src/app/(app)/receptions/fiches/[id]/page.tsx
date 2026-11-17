import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { exportMeta, exportNumber, loadExport } from "@/lib/server/sheets";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";

/** Un export de fiche de réception (contenu figé) */
export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const f = t.rsheet;
  const x = await loadExport(Number((await params).id));
  if (!x) notFound();
  const [meta, recs] = await Promise.all([
    exportMeta(user.locale),
    x.receptionIds.length ? getDb().select({ id: schema.receptions.id, supplierName: schema.receptions.supplierName, deliveredAt: schema.receptions.deliveredAt }).from(schema.receptions).where(inArray(schema.receptions.id, x.receptionIds)) : Promise.resolve([]),
  ]);
  const cell = (v: string | number | null) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v);
  return (
    <>
      <Link href="/receptions/fiches" className="no-print mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">← {f.back}</Link>
      <PageHeader title={`${f.title} N° ${exportNumber(x)}`}>
        <a className="btn-secondary" href={`/api/fiches/${x.id}?format=pdf`}><Icon name="download" className="h-4 w-4" /> {f.pdf}</a>
        <a className="btn-secondary" href={`/api/fiches/${x.id}?format=xlsx`}><Icon name="download" className="h-4 w-4" /> {f.excel}</a>
      </PageHeader>
      <section className="card mb-4 grid gap-3 p-4 text-sm sm:grid-cols-4">
        <div><span className="text-stone-500">{f.establishment}</span><p className="font-semibold">{meta.restaurant || "—"}</p></div>
        <div><span className="text-stone-500">{f.mode}</span><p><span className={`badge ${x.mode === "manual" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{x.mode === "manual" ? f.manualMention : f.autoMention}</span></p></div>
        <div><span className="text-stone-500">{x.day ? f.date : f.content}</span><p className="font-semibold">{x.day ? fmtDate(x.day, locale) : `${x.receptionCount} ${f.receptions.toLowerCase()}`}</p></div>
        <div><span className="text-stone-500">{f.createdAt}</span><p className="font-semibold">{fmtDateTime(x.createdAt, locale)} · {x.by ?? f.system}</p></div>
        <div className="sm:col-span-4"><span className="text-stone-500">{f.responsible}</span><p className="font-semibold">{meta.responsible || "—"}</p></div>
      </section>
      <section className="card mb-4 overflow-x-auto">
        <p className="px-4 pt-3 text-xs text-stone-500">{f.legend}</p>
        <table className="table mt-2 text-sm">
          <thead><tr>{x.data.header.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {x.data.rows.length === 0 && <tr><td colSpan={x.data.header.length} className="py-6 text-center text-stone-500">{f.empty}</td></tr>}
            {x.data.rows.map((r, i) => (
              <tr key={i}>{r.map((c, k) => <td key={k} className={k >= 3 && k !== 8 ? "text-center tabular-nums" : ""}><span className={c === f.nonCompliant || c === "NC" || (k === 8 && String(c).startsWith(f.refused)) ? "font-semibold text-red-700" : ""}>{cell(c)}</span></td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">{f.receptions}</h2>
        <ul className="space-y-1 text-sm">
          {recs.sort((a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime()).map((r) => (
            <li key={r.id}><Link className="text-brand-700 underline" href={`/receptions/${r.id}`}>{fmtDateTime(r.deliveredAt, locale)} · {r.supplierName}</Link></li>
          ))}
        </ul>
      </section>
    </>
  );
}
