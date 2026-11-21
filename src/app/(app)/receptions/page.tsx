import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { listReceptions, one, receptionFilters, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DraftBanner } from "@/components/reception/DraftBanner";
import { ReceptionsTable, type ReceptionRow } from "./ReceptionsTable";
import { exportNumber, lastAutoExport, runDueExports } from "@/lib/server/sheets";
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
    runDueExports().then(async () => { const [[c], last] = await Promise.all([getDb().select({ n: count() }).from(schema.receptionExports), lastAutoExport()]); return { n: c.n, last }; }),
  ]);
  return (
    <>
      <PageHeader title={t.receptions.title}>
        <Link href="/protocoles?id=proc-reception" className="btn-secondary py-1.5"><Icon name="book" className="h-4 w-4" /> {t.protocols.procedure}</Link>
      </PageHeader>

      {can.receive(user.role) && <DraftBanner />}
      {one(sp.draft) === "saved" && <p className="no-print mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{t.receptions.draftSaved}</p>}

      <h2 className="mb-2 text-lg font-semibold">{t.receptions.listTitle}</h2>

      <ReceptionsTable
        canDelete={can.deleteDraftReception(user.role)}
        canEdit={can.editReception(user.role)}
        rows={raw.map((r): ReceptionRow => ({
          id: r.id,
          number: r.number,
          blNumber: (r.documents as { type: string; number: string }[] | null)?.length
            ? (r.documents as { type: string; number: string }[]).map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc." : "BL"} ${d.number}`).join(" · ")
            : r.blNumber,
          date: fmtDateTime(r.deliveredAt, locale),
          dateSort: r.deliveredAt.toISOString(),
          day: r.deliveredAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }),
          supplierName: r.supplierName,
          lineCount: r.lineCount,
          status: r.status,
          statusLabel: t.receptionStatus[r.status],
          consolidated: !!r.consolidatedAt,
          author: r.createdByName,
        })).concat(
          // Brouillons en cours (réceptions pas encore enregistrées) : à reprendre depuis le tableau
          can.receive(user.role)
            ? drafts.map((d): ReceptionRow => ({
                id: -d.id, draftId: d.id, number: 0, blNumber: d.blNumber, date: fmtDateTime(d.updatedAt, locale), dateSort: d.updatedAt.toISOString(), day: d.updatedAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }),
                supplierName: d.supplierName || "—", lineCount: 0, status: "draft", statusLabel: t.receptions.draftStatus, consolidated: false, author: d.by,
              }))
            : [],
        )}
      />

      <section className="no-print card mt-6 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t.rsheet.title}</h2>
          <Link href="/receptions/fiches" className="text-sm font-semibold text-brand-700 underline">{t.rsheet.historyTitle}</Link>
        </div>
        <p className="mt-1 text-sm text-stone-600">{t.rsheet.historyHint}</p>
        <p className="mt-2 text-sm font-medium text-brand-700">{sheets.last ? `${t.rsheet.lastAuto} : N° ${exportNumber(sheets.last)} · ${fmtDateTime(sheets.last.createdAt, locale)} · ` : ""}{t.rsheet.nextAuto}</p>
      </section>
    </>
  );
}
