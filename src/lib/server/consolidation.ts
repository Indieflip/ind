import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { dateRange, one, type SP } from "./queries";

export interface Selection { from: string; to: string; supplier?: string; ids: number[]; explicit: boolean }

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

export function parseSelection(sp: SP | URLSearchParams): Selection {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) ?? undefined : one(sp[k]));
  const all = (k: string) => (sp instanceof URLSearchParams ? sp.getAll(k) : ([] as string[]).concat(sp[k] ?? []));
  const ids = [...all("id"), ...(get("ids") ?? "").split(",")].map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const from = valid(get("from")) ?? today();
  return { from, to: valid(get("to")) ?? from, supplier: get("supplier"), ids: [...new Set(ids)], explicit: get("sel") === "1" || ids.length > 0 };
}

/** Bons proposés à la sélection : ceux de la période (et du fournisseur) */
export async function candidateReceptions(sel: Selection) {
  const r = schema.receptions;
  const conds = [...dateRange(r.deliveredAt, sel.from, sel.to)];
  if (sel.supplier && /^\d+$/.test(sel.supplier)) conds.push(eq(r.supplierId, Number(sel.supplier)));
  return getDb()
    .select({ id: r.id, deliveredAt: r.deliveredAt, supplierName: r.supplierName, blNumber: r.blNumber, status: r.status })
    .from(r)
    .where(and(...conds))
    .orderBy(asc(r.deliveredAt));
}

export interface ConsolidatedProduct {
  productName: string;
  unit: string;
  bls: number;
  qtyOrdered: number | null;
  qtyReceived: number;
  qtyRefused: number;
  avgPrice: number | null;
  amount: number;
  reserves: number;
  refusals: number;
}
export interface ConsolidatedSupplier { supplierName: string; products: ConsolidatedProduct[]; amount: number; receptions: number }
export interface Consolidation {
  receptions: { id: number; deliveredAt: Date; supplierName: string; blNumber: string | null; status: string; amount: number; reservesText: string | null }[];
  suppliers: ConsolidatedSupplier[];
  amount: number;
  refusedAmount: number;
  lines: number;
  reserves: number;
  refusals: number;
}

/** Regroupe les bons choisis : par fournisseur puis par produit (et unité) */
export async function consolidate(ids: number[]): Promise<Consolidation> {
  const empty: Consolidation = { receptions: [], suppliers: [], amount: 0, refusedAmount: 0, lines: 0, reserves: 0, refusals: 0 };
  if (!ids.length) return empty;
  const db = getDb();
  const recs = await db.select().from(schema.receptions).where(inArray(schema.receptions.id, ids)).orderBy(asc(schema.receptions.deliveredAt));
  if (!recs.length) return empty;
  const lines = await db
    .select()
    .from(schema.receptionLines)
    .where(inArray(schema.receptionLines.receptionId, recs.map((r) => r.id)))
    .orderBy(asc(schema.receptionLines.position));

  const out: Consolidation = { ...empty, receptions: [] };
  const recAmount = new Map<number, number>();
  const bySupplier = new Map<string, { receptions: Set<number>; products: Map<string, ConsolidatedProduct & { priced: number; pricedQty: number; blSet: Set<number> }> }>();
  const recById = new Map(recs.map((r) => [r.id, r]));

  for (const l of lines) {
    const rec = recById.get(l.receptionId)!;
    const qo = num(l.qtyOrdered);
    const qr = num(l.qtyReceived) ?? 0;
    const price = num(l.unitPrice);
    const lineAmount = price != null ? qr * price : 0;
    const refused = l.decision === "refuse";

    const sup = bySupplier.get(rec.supplierName) ?? { receptions: new Set<number>(), products: new Map() };
    bySupplier.set(rec.supplierName, sup);
    sup.receptions.add(rec.id);
    const key = `${l.productId ?? l.productName.toLowerCase()}|${l.unit ?? ""}`;
    const p = sup.products.get(key) ?? {
      productName: l.productName, unit: l.unit ?? "", bls: 0, qtyOrdered: null, qtyReceived: 0, qtyRefused: 0,
      avgPrice: null, amount: 0, reserves: 0, refusals: 0, priced: 0, pricedQty: 0, blSet: new Set<number>(),
    };
    sup.products.set(key, p);
    p.blSet.add(rec.id);
    if (qo != null) p.qtyOrdered = (p.qtyOrdered ?? 0) + qo;
    if (refused) {
      p.qtyRefused += qr;
      p.refusals++;
      out.refusedAmount += lineAmount;
    } else {
      p.qtyReceived += qr;
      p.amount += lineAmount;
      recAmount.set(rec.id, (recAmount.get(rec.id) ?? 0) + lineAmount);
      if (price != null) {
        p.priced += lineAmount;
        p.pricedQty += qr;
      }
    }
    if (l.decision === "reserve") p.reserves++;
    out.lines++;
    if (l.decision === "reserve") out.reserves++;
    if (refused) out.refusals++;
  }

  for (const [supplierName, sup] of [...bySupplier.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"))) {
    const products = [...sup.products.values()]
      .map(({ priced, pricedQty, blSet, ...p }) => ({ ...p, bls: blSet.size, avgPrice: pricedQty > 0 ? priced / pricedQty : null }))
      .sort((a, b) => a.productName.localeCompare(b.productName, "fr"));
    const amount = products.reduce((s, p) => s + p.amount, 0);
    out.suppliers.push({ supplierName, products, amount, receptions: sup.receptions.size });
    out.amount += amount;
  }
  out.receptions = recs.map((r) => ({
    id: r.id, deliveredAt: r.deliveredAt, supplierName: r.supplierName, blNumber: r.blNumber, status: r.status,
    amount: recAmount.get(r.id) ?? 0, reservesText: r.reservesText,
  }));
  return out;
}

/** Les bons à consolider : ceux cochés, sinon tous ceux de la période */
export async function resolveIds(sel: Selection) {
  if (sel.explicit) return sel.ids; // sélection manuelle (éventuellement vide)
  return (await candidateReceptions(sel)).map((r) => r.id);
}
