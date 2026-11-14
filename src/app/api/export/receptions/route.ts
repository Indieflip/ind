import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { dictFor } from "@/lib/i18n";
import { csvResponse, num } from "@/lib/format";
import { receptionWhere } from "@/lib/server/queries";

/** Une ligne par produit contrôlé — sert aussi de registre HACCP */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const t = dictFor(user.locale);
  const sp = new URL(req.url).searchParams;
  const f = { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, supplier: sp.get("supplier") ?? undefined, status: sp.get("status") ?? undefined };
  const r = schema.receptions;
  const l = schema.receptionLines;
  const rows = await getDb()
    .select({ rec: r, line: l, catFr: schema.categories.nameFr, catEn: schema.categories.nameEn })
    .from(l)
    .innerJoin(r, eq(r.id, l.receptionId))
    .leftJoin(schema.categories, eq(schema.categories.id, l.categoryId))
    .where(receptionWhere(f))
    .orderBy(asc(r.deliveredAt), asc(l.position));

  const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);
  const out: (string | number | null)[][] = [[
    t.common.date, t.common.supplier, t.receptions.bl, t.receptions.driver, t.receptions.truckTemp, t.receptions.vehicleClean,
    t.common.product, t.common.category, t.common.unit, t.wizard.ordered, t.wizard.received, t.wizard.temperature,
    t.wizard.dlc, t.wizard.lot, t.wizard.unitPrice, t.wizard.mercurial, t.common.status, t.wizard.reason, t.receptions.title,
  ]];
  for (const { rec, line, catFr, catEn } of rows) {
    out.push([
      fmt(rec.deliveredAt), rec.supplierName, rec.blNumber, rec.driverName, rec.truckTemp,
      rec.vehicleClean == null ? "" : rec.vehicleClean ? t.common.yes : t.common.no,
      line.productName, user.locale === "en" ? catEn : catFr, line.unit, num(line.qtyOrdered), num(line.qtyReceived), line.temperature,
      line.dlc, line.lot, num(line.unitPrice), num(line.mercurialPrice), t.decision[line.decision],
      line.reason ? (t.reasons as Record<string, string>)[line.reason] ?? line.reason : "", t.receptionStatus[rec.status],
    ]);
  }
  return csvResponse(`receptions-${new Date().toISOString().slice(0, 10)}.csv`, out);
}
