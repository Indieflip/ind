import "server-only";
import { eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { countriesOf } from "@/lib/server/maj";
import { similarity } from "@/lib/fuzzy";
import { nameKey, normalize } from "@/lib/search";

/**
 * Mercurial propre : rattache au compte produit (chez le même fournisseur) tout ce qui ne l'est pas encore
 * — écarts de pesée, produits des fiches d'anomalie, lignes de réception, historique de mise à jour.
 * Rapprochement par nom (mêmes nombres et même origine exigés pour un nom approché), jamais vers un autre fournisseur.
 */
export async function linkToProducts() {
  const db = getDb();
  const products = (await db.select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId, active: schema.products.active }).from(schema.products))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id);
  const bySupplier = new Map<number, typeof products>();
  for (const p of products) bySupplier.set(p.supplierId, [...(bySupplier.get(p.supplierId) ?? []), p]);
  // Rapprochement prudent : nom identique (accents, pluriels, ponctuation ignorés), sinon nom proche avec mêmes nombres
  // et même origine (quand les deux en indiquent une) ; en cas d'égalité entre deux produits, rien n'est rattaché.
  // Parenthèse d'origine (pays) ignorée ; une parenthèse de préparation (« filet sans peau ») est gardée : c'est un autre produit
  const base = (x: string) => x.replace(/\(([^)]*)\)/g, (m, inner: string) => (countriesOf(inner).length ? " " : m)).replace(/\s+-\s+[\d.,]+\s*€.*$/, " ");
  const nums = (x: string) => new Set((normalize(x).match(/\d+(?:[.,]\d+)?/g) ?? []).map((d) => d.replace(",", ".")));
  const find = (name: string, supplierId: number | null) => {
    if (!supplierId || !name.trim()) return undefined;
    const own = bySupplier.get(supplierId) ?? [];
    const n = normalize(name);
    const exact = own.find((p) => normalize(p.name) === n) ?? own.find((p) => nameKey(p.name) === nameKey(name)) ?? own.find((p) => nameKey(base(p.name)) === nameKey(base(name)));
    if (exact) return exact;
    const need = nums(base(name));
    const origin = countriesOf(name);
    const scored = own
      .filter((p) => { const have = nums(base(p.name)); return [...need].every((d) => have.has(d)); })
      .filter((p) => { const c = countriesOf(p.name); return !origin.length || !c.length || c.some((k) => origin.includes(k)); })
      .map((p) => ({ p, s: similarity(base(name), base(p.name)) }))
      .sort((a, b) => b.s - a.s);
    if (!scored[0] || scored[0].s < 0.7) return undefined;
    if (scored[1] && scored[0].s - scored[1].s < 0.05) return undefined;
    return scored[0].p;
  };
  let n = 0;

  // Écarts de pesée
  for (const g of await db.select({ id: schema.weighGaps.id, product: schema.weighGaps.product, supplierId: schema.weighGaps.supplierId }).from(schema.weighGaps).where(isNull(schema.weighGaps.productId))) {
    const p = find(g.product, g.supplierId);
    if (p) { await db.update(schema.weighGaps).set({ productId: p.id }).where(eq(schema.weighGaps.id, g.id)); n++; }
  }
  // Lignes de réception
  const lines = await db
    .select({ id: schema.receptionLines.id, name: schema.receptionLines.productName, supplierId: schema.receptions.supplierId })
    .from(schema.receptionLines)
    .innerJoin(schema.receptions, eq(schema.receptions.id, schema.receptionLines.receptionId))
    .where(isNull(schema.receptionLines.productId));
  for (const l of lines) {
    const p = find(l.name, l.supplierId);
    if (p) { await db.update(schema.receptionLines).set({ productId: p.id }).where(eq(schema.receptionLines.id, l.id)); n++; }
  }
  // Historique de mise à jour du Mercurial
  for (const m of await db.select({ id: schema.majLog.id, item: schema.majLog.item, supplierId: schema.majLog.supplierId }).from(schema.majLog).where(isNull(schema.majLog.productId))) {
    const p = find(m.item ?? "", m.supplierId);
    if (p) { await db.update(schema.majLog).set({ productId: p.id }).where(eq(schema.majLog.id, m.id)); n++; }
  }
  // Fiches d'anomalie : produits de la fiche et produit principal
  const gapProduct = new Map((await db.select({ name: schema.weighGaps.product, supplierId: schema.weighGaps.supplierId, productId: schema.weighGaps.productId }).from(schema.weighGaps)).filter((g) => g.productId).map((g) => [`${g.supplierId}|${g.name.trim().toLowerCase()}`, g.productId!]));
  const anomalies = await db
    .select({ id: schema.anomalies.id, items: schema.anomalies.items, supplierId: schema.anomalies.supplierId, productId: schema.anomalies.productId, productName: schema.anomalies.productName })
    .from(schema.anomalies)
    .where(sql`(${schema.anomalies.items} is not null and ${schema.anomalies.items}::text like '%"productId": null%') or (${schema.anomalies.productId} is null and ${schema.anomalies.productName} is not null)`);
  for (const a of anomalies) {
    let changed = false;
    const items = (a.items ?? []).map((it) => {
      if (it.productId) return it;
      const pid = gapProduct.get(`${a.supplierId}|${it.name.trim().toLowerCase()}`) ?? find(it.name, a.supplierId)?.id;
      if (!pid) return it;
      changed = true;
      return { ...it, productId: pid };
    });
    const main = a.productId ?? items[0]?.productId ?? (a.productName ? find(a.productName, a.supplierId)?.id : undefined) ?? null;
    if (changed || main !== a.productId) {
      await db.update(schema.anomalies).set({ ...(changed ? { items } : {}), productId: main }).where(eq(schema.anomalies.id, a.id));
      n++;
    }
  }
  return n;
}
