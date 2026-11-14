import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dictFor } from "@/lib/i18n";
import { csvResponse } from "@/lib/format";
import { consolidate, parseSelection, resolveIds } from "@/lib/server/consolidation";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !can.consolidate(user.role)) return new Response("Forbidden", { status: 403 });
  const t = dictFor(user.locale);
  const c = t.consolidation;
  const result = await consolidate(await resolveIds(parseSelection(new URL(req.url).searchParams)));
  const r2 = (n: number | null) => (n == null ? null : Math.round(n * 10000) / 10000);
  const rows: (string | number | null)[][] = [[t.common.supplier, t.common.product, t.common.unit, c.qtyOrdered, c.qtyReceived, c.qtyRefused, c.avgPrice, c.amount, t.reporting.reserves, t.reporting.refusals]];
  for (const s of result.suppliers) {
    for (const p of s.products) rows.push([s.supplierName, p.productName, p.unit, p.qtyOrdered, p.qtyReceived, p.qtyRefused, r2(p.avgPrice), r2(p.amount), p.reserves, p.refusals]);
    rows.push([s.supplierName, c.subtotal, null, null, null, null, null, r2(s.amount), null, null]);
  }
  rows.push([c.grandTotal, null, null, null, null, null, null, r2(result.amount), result.reserves, result.refusals]);
  rows.push([]);
  rows.push([c.included, t.common.date, t.receptions.bl, c.amount]);
  const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);
  for (const r of result.receptions) rows.push([r.supplierName, fmt(r.deliveredAt), r.blNumber, r2(r.amount)]);
  return csvResponse(`consolidation-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
