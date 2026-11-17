import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { listReceptions, one, receptionFilters, type SP } from "@/lib/server/queries";
import { Field, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DraftBanner, DeleteDraftButton } from "@/components/reception/DraftBanner";
import { ReceptionsTable } from "./ReceptionsTable";
import { parisDay, sheetNumber, sheetsAwaitingValidation } from "@/lib/server/sheets";
import { count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export default async function ReceptionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const f = receptionFilters(sp);
  const [raw, drafts, sheets] = await Promise.all([
    listReceptions(f),
    getDb()
      .select({ id: schema.receptionDrafts.id, supplierName: schema.receptionDrafts.supplierName, blNumber: schema.receptionDrafts.blNumber, updatedAt: schema.receptionDrafts.updatedAt, by: schema.users.name })
      .from(schema.receptionDrafts)
      .leftJoin(schema.users, eq(schema.users.id, schema.receptionDrafts.createdBy))
      .orderBy(desc(schema.receptionDrafts.updatedAt)),
    Promise.all([
      getDb().select({ n: count() }).from(schema.receptionSheets),
      getDb().query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.date, parisDay()) }),
      sheetsAwaitingValidation(),
    ]).then(([[c], today, pending]) => ({ n: c.n, today, pending })),
  ]);
  return (
    <>
      <PageHeader title={t.receptions.title} />

      {can.receive(user.role) && <DraftBanner />}
      {one(sp.draft) === "saved" && <p className="no-print mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{t.receptions.draftSaved}</p>}
      {drafts.length > 0 && can.receive(user.role) && (
        <section className="no-print card mb-4 border-l-4 border-l-amber-400">
          <h2 className="px-4 pt-3 text-sm font-semibold">{t.receptions.drafts} ({drafts.length})</h2>
          <ul className="divide-y divide-stone-100">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <strong>{d.supplierName || "—"}</strong>
                  {d.blNumber && <span className="text-stone-500"> · BL {d.blNumber}</span>}
                  <span className="text-xs text-stone-500"> · {fmtDateTime(d.updatedAt, locale)}{d.by ? ` ${t.receptions.draftBy} ${d.by}` : ""}</span>
                </span>
                <Link href={`/receptions/new?draft=${d.id}`} className="btn-primary px-3 py-1.5">{t.receptions.resumeDraft}</Link>
                {can.deleteDraftReception(user.role) && <DeleteDraftButton id={d.id} confirmText={t.receptions.deleteDraftConfirm} label={t.common.delete} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form method="get" className="no-print card mb-3 flex flex-wrap items-end gap-3 p-3">
        <Field label={t.common.from}><input type="date" name="from" defaultValue={f.from} className="input py-2" /></Field>
        <Field label={t.common.to}><input type="date" name="to" defaultValue={f.to} className="input py-2" /></Field>
        <button className="btn-secondary py-2">{t.common.apply}</button>
        {(f.from || f.to) && <Link href="/receptions" className="btn-ghost py-2">{t.common.reset}</Link>}
      </form>

      <ReceptionsTable
        canDelete={can.deleteDraftReception(user.role)}
        rows={raw.map((r) => ({
          id: r.id,
          number: r.number,
          blNumber: (r.documents as { type: string; number: string }[] | null)?.length
            ? (r.documents as { type: string; number: string }[]).map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc." : "BL"} ${d.number}`).join(" · ")
            : r.blNumber,
          date: fmtDateTime(r.deliveredAt, locale),
          dateSort: r.deliveredAt.toISOString(),
          supplierName: r.supplierName,
          lineCount: r.lineCount,
          status: r.status,
          statusLabel: t.receptionStatus[r.status],
          consolidated: !!r.consolidatedAt,
          author: r.createdByName,
        }))}
      />

      <section className="no-print card mt-6 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t.rsheet.title}</h2>
          <Link href="/receptions/fiches" className="text-sm font-semibold text-brand-700 underline">{t.rsheet.list} ({sheets.n})</Link>
        </div>
        <p className="mt-1 text-sm text-stone-600">{t.rsheet.hint} {t.rsheet.autoHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sheets.today ? (
            <Link href={`/receptions/fiches/${sheets.today.id}`} className="btn-primary"><Icon name="file" className="h-4 w-4" /> {t.rsheet.openToday} · N° {sheetNumber(sheets.today)}</Link>
          ) : (
            <span className="text-sm text-stone-500">{t.rsheet.noToday}</span>
          )}
          {sheets.pending > 0 && <Link href="/receptions/fiches" className="badge bg-amber-100 text-amber-900">{sheets.pending} {t.rsheet.toValidate.toLowerCase()}</Link>}
        </div>
      </section>
    </>
  );
}
