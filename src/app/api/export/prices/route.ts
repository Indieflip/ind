import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dictFor } from "@/lib/i18n";
import { csvResponse, num } from "@/lib/format";
import { listPriceChanges } from "@/lib/server/prices";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !can.viewPrices(user.role)) return new Response("Forbidden", { status: 403 });
  const t = dictFor(user.locale);
  const sp = new URL(req.url).searchParams;
  const rows = await listPriceChanges(
    { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, supplier: sp.get("supplier") ?? undefined, type: sp.get("type") ?? undefined, unclaimed: sp.get("unclaimed") ?? undefined },
    100000,
  );
  const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Europe/Paris" }).format(d);
  return csvResponse(`suivi-prix-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["N°", t.common.date, t.common.supplier, t.common.product, t.common.unit, t.prices.document, t.prices.type, `${t.prices.variation} %`, t.prices.old, t.prices.new, t.prices.source, t.prices.claim],
    ...rows.map((r) => [r.number, fmt(r.date), r.supplierName, r.productName, r.unit, r.document, t.prices.types[r.type], r.pct, num(r.oldPrice), num(r.newPrice), t.prices.sources[r.source], r.claim]),
  ]);
}
