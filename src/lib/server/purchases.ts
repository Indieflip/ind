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
export async function loadPurchases(freq: PurchaseFreq, locale: string, labels: { weekOf: string; noSupplier: string }, range?: { from?: string; to?: string }) {
  const { unit } = PURCHASE_FREQS[freq];
  // Période : du mois « from » au mois « to » (AAAA-MM) ; par défaut les 6 derniers mois
  const nowP = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const ok = (v?: string) => (v && /^\d{4}-\d{2}$/.test(v) ? v : undefined);
  let to = ok(range?.to) ?? ym(nowP);
  let from = ok(range?.from) ?? ym(new Date(nowP.getFullYear(), nowP.getMonth() - 5, 1));
  if (from > to) [from, to] = [to, from];
  const fromDate = `${from}-01`;
  const [ty, tm] = to.split("-").map(Number);
  const endDate = `${tm === 12 ? ty + 1 : ty}-${String(tm === 12 ? 1 : tm + 1).padStart(2, "0")}-01`;
  const res = await getDb().execute<{ period: string; supplier_id: number | null; supplier: string | null; product: string; nature: string | null; amount: string }>(sql`
    select to_char(date_trunc(${unit}, r.delivered_at at time zone 'Europe/Paris'), 'YYYY-MM-DD') as period, r.supplier_id, s.name as supplier,
           coalesce(p.name, l.product_name) as product, p.nature,
           sum(coalesce(l.qty_ordered, l.qty_received, 0) * coalesce(l.unit_price, 0))::text as amount
    from receptions r
    join reception_lines l on l.reception_id = r.id
    left join suppliers s on s.id = r.supplier_id
    left join products p on p.id = l.product_id
    where l.decision <> 'refuse'
      and r.delivered_at at time zone 'Europe/Paris' >= ${fromDate}::date and r.delivered_at at time zone 'Europe/Paris' < ${endDate}::date
    group by 1, 2, 3, 4, 5
  `);

  // Les périodes affichées, de la plus ancienne à la plus récente, dans l'intervalle choisi
  const periods: { key: string; label: string }[] = [];
  const startOf = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (unit === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    if (unit === "month") x.setDate(1);
    if (unit === "quarter") { x.setDate(1); x.setMonth(Math.floor(x.getMonth() / 3) * 3); }
    if (unit === "year") { x.setDate(1); x.setMonth(0); }
    return x;
  };
  const last = new Date(`${endDate}T12:00:00`); last.setDate(last.getDate() - 1);
  for (let d = startOf(new Date(`${fromDate}T12:00:00`)); d <= last && periods.length < 200;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label =
      unit === "week" ? `${labels.weekOf} ${d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}`
      : unit === "month" ? d.toLocaleDateString(locale, { month: "short", year: "2-digit" })
      : unit === "quarter" ? `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
      : String(d.getFullYear());
    periods.push({ key, label });
    if (unit === "week") d.setDate(d.getDate() + 7);
    else if (unit === "month") d.setMonth(d.getMonth() + 1);
    else if (unit === "quarter") d.setMonth(d.getMonth() + 3);
    else d.setFullYear(d.getFullYear() + 1);
  }
  const rows: PurchaseRow[] = res.rows
    .map((r) => ({ supplierId: r.supplier_id, supplier: r.supplier ? sentence(r.supplier) : labels.noSupplier, product: r.product, nature: r.nature ?? "", period: r.period, amount: Number(r.amount) || 0 }))
    .filter((r) => r.amount);
  return { periods, rows, from, to };
}
