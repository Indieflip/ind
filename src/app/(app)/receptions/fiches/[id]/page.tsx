import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getRestaurantName } from "@/lib/settings";
import { canValidateSheets, lastValidated, loadSheet, sheetNumber } from "@/lib/server/sheets";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SheetActions } from "../SheetClient";

const statusStyle: Record<string, string> = { pending: "bg-amber-100 text-amber-900", validated: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-800" };

/** Fiche de réception de marchandises d'un jour : version en cours, validation, modifications, historique, export */
export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const f = t.rsheet;
  const s = await loadSheet(Number((await params).id));
  if (!s) notFound();
  const [canValidate, restaurant] = await Promise.all([canValidateSheets(user), getRestaurantName()]);
  const current = s.versions[0];
  const valid = lastValidated(s);
  const shown = current;
  const cell = (v: string | number | null) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v);

  return (
    <>
      <Link href="/receptions/fiches" className="no-print mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">← {f.back}</Link>
      <PageHeader title={`${f.title} N° ${sheetNumber(s.sheet)}`}>
        {valid ? (
          <>
            <a className="btn-secondary" href={`/api/fiches/${s.sheet.id}?format=pdf`}><Icon name="download" className="h-4 w-4" /> {f.pdf}</a>
            <a className="btn-secondary" href={`/api/fiches/${s.sheet.id}?format=xlsx`}><Icon name="download" className="h-4 w-4" /> {f.excel}</a>
          </>
        ) : (
          <span className="text-sm text-stone-500">{f.noValidated}</span>
        )}
      </PageHeader>

      <section className="card mb-4 grid gap-3 p-4 text-sm sm:grid-cols-4">
        <div><span className="text-stone-500">{f.establishment}</span><p className="font-semibold">{restaurant || "—"}</p></div>
        <div><span className="text-stone-500">{f.date}</span><p className="font-semibold">{fmtDate(s.sheet.date, locale)}</p></div>
        <div><span className="text-stone-500">{f.status}</span><p><span className={`badge ${statusStyle[current.status]}`}>{f.statuses[current.status as "pending"]} · V{current.version}</span></p></div>
        <div><span className="text-stone-500">{f.lastValidated}</span><p className="font-semibold">{valid ? `V${valid.version} · ${fmtDateTime(valid.reviewedAt!, locale)}${valid.reviewer ? ` ${f.by} ${valid.reviewer}` : ""}` : "—"}</p></div>
      </section>

      <section className="card mb-4 p-4">
        <SheetActions sheetId={s.sheet.id} versionId={current.id} status={current.status} canValidate={canValidate} />
      </section>

      <section className="card mb-4 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{f.preview} V{shown.version} <span className={`badge ml-1 ${statusStyle[shown.status]}`}>{f.statuses[shown.status as "pending"]}</span></h2>
        <p className="px-4 text-xs text-stone-500">{f.legend}</p>
        <table className="table mt-2 text-sm">
          <thead><tr>{shown.data.header.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.data.rows.length === 0 && <tr><td colSpan={shown.data.header.length} className="py-6 text-center text-stone-500">{f.empty}</td></tr>}
            {shown.data.rows.map((r, i) => (
              <tr key={i}>{r.map((c, k) => <td key={k} className={k >= 3 && k !== 8 ? "text-center tabular-nums" : ""}><span className={c === "NC" || (k === 8 && String(c).startsWith(f.refused)) ? "font-semibold text-red-700" : ""}>{cell(c)}</span></td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">{f.history}</h2>
        <ol className="space-y-2 text-sm">
          {s.versions.map((x) => (
            <li key={x.id} className="rounded-lg border border-stone-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong>V{x.version}</strong>
                <span className={`badge ${statusStyle[x.status]}`}>{f.statuses[x.status as "pending"]}</span>
                <span className="text-stone-600">{x.version === 1 ? f.created : f.modification} · {fmtDateTime(x.createdAt, locale)}{x.by ? ` ${f.by} ${x.by}` : ""}</span>
                <span className="text-xs text-stone-400">{x.receptionCount} {f.receptions.toLowerCase()} · {x.lineCount} {f.lines.toLowerCase()}</span>
              </div>
              {x.reason && <p className="mt-1 text-stone-700">« {x.reason} »</p>}
              {x.reviewedAt && <p className="mt-1 text-xs text-stone-500">{x.status === "validated" ? f.validatedOn : f.rejectedOn} {fmtDateTime(x.reviewedAt, locale)}{x.reviewer ? ` ${f.by} ${x.reviewer}` : ""}{x.reviewNote ? ` — ${x.reviewNote}` : ""}</p>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
