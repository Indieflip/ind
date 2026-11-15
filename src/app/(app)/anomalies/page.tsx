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

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewAnomalies);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const a = schema.anomalies;
  const by = alias(schema.users, "by");
  const db = getDb();
  const [active, consolidated, recent, numbers] = await Promise.all([
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
  ]);
  const day = today();
  const toRow = (x: typeof active[number]) => ({
    id: x.id,
    date: fmtDate(x.createdAt, locale),
    dateSort: x.createdAt.toISOString(),
    nature: x.nature ?? "",
    supplier: x.reference ? `${x.supplierName} : ${x.reference}` : x.supplierName,
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
