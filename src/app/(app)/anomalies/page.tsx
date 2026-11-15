import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import { one, receptionNumbers, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { AnomaliesBoard, AnomalyForm } from "./AnomalyClient";
import { lineDocLabel } from "@/lib/documents";
import { ensureAnomaliesLinked } from "@/lib/server/maj";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  await ensureAnomaliesLinked();
  const a = schema.anomalies;
  const by = alias(schema.users, "by");
  const db = getDb();
  const [active, consolidated, recent, numbers, docs] = await Promise.all([
    db.select().from(a).where(isNull(a.consolidatedAt)).orderBy(desc(a.createdAt)),
    db
      .select({ a, byName: by.name })
      .from(a)
      .leftJoin(by, eq(by.id, a.consolidatedBy))
      .where(isNotNull(a.consolidatedAt))
      .orderBy(desc(a.consolidatedAt))
      .limit(500),
    db
      .select({ id: schema.receptions.id, blNumber: schema.receptions.blNumber, supplierName: schema.receptions.supplierName, deliveredAt: schema.receptions.deliveredAt })
      .from(schema.receptions)
      .orderBy(desc(schema.receptions.deliveredAt))
      .limit(300),
    receptionNumbers(),
    // Documents des bons (type, numéro, date) et fournisseurs, pour les colonnes Fournisseur et BL / Facture
    db
      .select({ id: a.id, documents: schema.receptions.documents, blNumber: schema.receptions.blNumber, lineDoc: schema.receptionLines.document, supplier: schema.suppliers.name })
      .from(a)
      .leftJoin(schema.receptions, eq(schema.receptions.id, a.receptionId))
      .leftJoin(schema.receptionLines, eq(schema.receptionLines.id, a.lineId))
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, a.supplierId)),
  ]);
  const extra = new Map(docs.map((d) => [d.id, d]));
  // N° : définitif une fois consolidée ; avant, numéro provisoire (suite des numéros, par date)
  const maxNum = consolidated.reduce((m, c) => Math.max(m, c.a.number ?? 0), 0);
  const provisional = new Map([...active].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id - y.id).map((x, i) => [x.id, maxNum + i + 1]));
  const day = today();
  const toRow = (x: typeof active[number]) => ({
    id: x.id,
    number: x.number ?? provisional.get(x.id) ?? null,
    numberFinal: x.number != null,
    date: fmtDate(x.createdAt, locale),
    dateSort: x.createdAt.toISOString(),
    nature: x.nature ?? "",
    supplier: extra.get(x.id)?.supplier ?? x.supplierName,
    supplierId: x.supplierId,
    reference: (x.receptionId ? lineDocLabel(extra.get(x.id)?.documents, extra.get(x.id)?.lineDoc, extra.get(x.id)?.blNumber) : null) ?? x.reference ?? "",
    product: x.productName ?? "",
    problem: x.description,
    action: x.followUp ?? "",
    lastActionAt: x.lastActionAt ?? "",
    result: x.result ?? "",
    saving: num(x.creditAmount),
    status: x.status,
    statusLabel: t.anomalies.statuses[x.status],
    type: t.anomalies.types[x.type],
    nextActionAt: x.nextActionAt ?? "",
    due: !!x.nextActionAt && x.nextActionAt <= day,
    receptionId: x.receptionId,
    photoUrl: x.photoUrl,
  });
  const preselect = Number(one(sp.reception)) || null;
  return (
    <>
      <PageHeader title={t.anomalies.title} />
      {can.createAnomaly(user.role) && (
        <AnomalyForm
          preselect={preselect}
          receptions={recent.map((r) => ({ id: r.id, label: `${numbers.get(r.id) ?? ""}. ${r.blNumber ? r.blNumber : "—"} · ${r.supplierName} · ${fmtDate(r.deliveredAt, locale)}` }))}
        />
      )}
      <AnomaliesBoard
        rows={active.map(toRow)}
        consolidated={consolidated.map(({ a: x, byName }) => ({ ...toRow(x), consolidated: `${fmtDateTime(x.consolidatedAt, locale)}${byName ? ` ${t.consolidation.by} ${byName}` : ""}` }))}
        canManage={can.manageAnomalies(user.role)}
        canConsolidate={can.consolidate(user.role)}
        today={day}
      />
    </>
  );
}
