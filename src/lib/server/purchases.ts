import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sentence } from "@/lib/format";

export const PURCHASE_FREQS = { semaine: { unit: "week", count: 12 }, mois: { unit: "month", count: 12 }, trimestre: { unit: "quarter", count: 8 }, annee: { unit: "year", count: 4 } } as const;
export type PurchaseFreq = keyof typeof PURCHASE_FREQS;
export interface PurchaseRow { supplierId: number | null; supplier: string; product: string; nature: string; period: string; amount: number }

/**
 * Achats des réceptions saisies dans l'application, par période, fournisseur, produit et nature :
 * Q facturée (ou contrôlée à défaut) × prix unitaire, produits refusés exclus.
 */
export async function loadPurchases(freq: PurchaseFreq, locale: string, labels: { weekOf: string; noSupplier: string }) {
  const { unit, count } = PURCHASE_FREQS[freq];
  const step = sql.raw(`interval '${unit === "quarter" ? "3 months" : `1 ${unit}`}'`);
  const res = await getDb().execute<{ period: string; supplier_id: number | null; supplier: string | null; product: string; nature: string | null; amount: string }>(sql`
    with periods as (
      select generate_series(date_trunc(${unit}, (now() at time zone 'Europe/Paris')) - (${count - 1}::int * ${step}), date_trunc(${unit}, (now() at time zone 'Europe/Paris')), ${step}) as p
    )
    select to_char(date_trunc(${unit}, r.delivered_at at time zone 'Europe/Paris'), 'YYYY-MM-DD') as period, r.supplier_id, s.name as supplier,
           coalesce(p.name, l.product_name) as product, p.nature,
           sum(coalesce(l.qty_ordered, l.qty_received, 0) * coalesce(l.unit_price, 0))::text as amount
    from receptions r
    join reception_lines l on l.reception_id = r.id
    left join suppliers s on s.id = r.supplier_id
    left join products p on p.id = l.product_id
    where l.decision <> 'refuse'
      and r.delivered_at at time zone 'Europe/Paris' >= (select min(p) from periods)
    group by 1, 2, 3, 4, 5
  `);

  // Les périodes affichées, de la plus ancienne à la plus récente
  const periods: { key: string; label: string }[] = [];
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (unit === "week") cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
  if (unit === "month") cur.setDate(1);
  if (unit === "quarter") { cur.setDate(1); cur.setMonth(Math.floor(cur.getMonth() / 3) * 3); }
  if (unit === "year") { cur.setDate(1); cur.setMonth(0); }
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(cur);
    if (unit === "week") d.setDate(d.getDate() - 7 * i);
    if (unit === "month") d.setMonth(d.getMonth() - i);
    if (unit === "quarter") d.setMonth(d.getMonth() - 3 * i);
    if (unit === "year") d.setFullYear(d.getFullYear() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label =
      unit === "week" ? `${labels.weekOf} ${d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}`
      : unit === "month" ? d.toLocaleDateString(locale, { month: "short", year: "2-digit" })
      : unit === "quarter" ? `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
      : String(d.getFullYear());
    periods.push({ key, label });
  }
  const rows: PurchaseRow[] = res.rows
    .map((r) => ({ supplierId: r.supplier_id, supplier: r.supplier ? sentence(r.supplier) : labels.noSupplier, product: r.product, nature: r.nature ?? "", period: r.period, amount: Number(r.amount) || 0 }))
    .filter((r) => r.amount);
  return { periods, rows };
}
