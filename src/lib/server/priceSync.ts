import "server-only";
import { asc, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { priceDiffPct } from "@/lib/rules";
import { matchProduct } from "./maj";

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
/** « Augmentation de 11,60€ à 12,35€ », « tarif : diminution de 2,3 à 2,25 », « tarid : diminutio, de 2,50 à 1,85 » */
const VARIATION = new RegExp(String.raw`(?:augment|dimin|baisse|hausse|tari[fd])[^\d]*?de\s*${NUM}\s*€?\s*à\s*${NUM}`, "i");
const toNum = (s: string) => Number(s.replace(",", "."));
const isVariation = (s: string | null | undefined) => !!s && VARIATION.test(s);

/** Date du document citée dans « Facture 510724 du 23/06/26 » */
function refDate(ref: string | null) {
  const m = /du\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(ref ?? "");
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const strip = (s: string | null, prefix: RegExp) => (s ?? "").replace(prefix, "").trim();

/**
 * Historique des modifications du Mercurial → Suivi des prix :
 * chaque hausse ou baisse de tarif devient une ligne de variation de prix (une seule fois, rattachée par maj_id).
 * Deux formats dans l'historique :
 *  - récent : Produit = libellé, Détail = « Augmentation de X€ à Y€ » ;
 *  - ancien (3 lignes) : « produit : … », « presta : … », « tarif : augmentation de X à Y » pour un même document.
 * Les rajouts produits ne sont pas des variations : ignorés.
 */
export async function syncMajPrices() {
  const db = getDb();
  const [rows, done, products, suppliers] = await Promise.all([
    db.select().from(schema.majLog).orderBy(asc(schema.majLog.position), asc(schema.majLog.id)),
    db.select({ majId: schema.priceChanges.majId }).from(schema.priceChanges).where(isNotNull(schema.priceChanges.majId)),
    db.select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId, unit: schema.products.unit }).from(schema.products),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers),
  ]);
  const seen = new Set(done.map((d) => d.majId));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const out: (typeof schema.priceChanges.$inferInsert)[] = [];

  rows.forEach((r, i) => {
    if (seen.has(r.id)) return;
    const inDetail = isVariation(r.detail) && !/^\s*(tari[fd]|presta|produit)\s*:/i.test(r.item ?? "");
    const inItem = /^\s*tari[fd]\s*:/i.test(r.item ?? "") && isVariation(r.item);
    if (!inDetail && !inItem) return;
    const m = VARIATION.exec((inDetail ? r.detail : r.item)!)!;
    const oldP = toNum(m[1]);
    const newP = toNum(m[2]);
    if (!(oldP > 0) || !(newP >= 0) || oldP === newP) return;

    let supplierId = r.supplierId;
    let productId = r.productId;
    let label = r.item ?? "";
    if (inItem) {
      // Ancien format : produit et prestataire sur les lignes juste avant (même document)
      label = "";
      for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
        const p = rows[k];
        if (p.reference !== r.reference || /^\s*tari[fd]\s*:/i.test(p.item ?? "")) break;
        if (/^\s*presta\s*:/i.test(p.item ?? "") && !supplierId) supplierId = p.supplierId;
        if (/^\s*produit\s*:/i.test(p.item ?? "") && !label) {
          label = strip(p.item, /^\s*produit\s*:\s*/i);
          productId = p.productId;
        }
      }
      if (!label) return;
    }
    if (!productId) productId = matchProduct(label, supplierId, products)?.id ?? null;
    const product = productId ? productById.get(productId) : undefined;
    if (!supplierId && product) supplierId = product.supplierId;
    const date = r.date ?? refDate(r.reference);
    const claim = r.claim && r.claim.trim() !== "-" ? r.claim.trim() : null;
    out.push({
      date: date ? new Date(`${date}T12:00:00`) : r.createdAt,
      supplierId,
      supplierName: (supplierId && supplierName.get(supplierId)) || "",
      productId: product?.id ?? null,
      productName: product?.name ?? label,
      unit: product?.unit ?? null,
      oldPrice: String(oldP),
      newPrice: String(newP),
      pct: priceDiffPct(newP, oldP),
      type: newP > oldP ? "increase" : "decrease",
      source: "mercurial",
      invoiceRef: r.reference,
      claim,
      majId: r.id,
    });
  });
  for (let k = 0; k < out.length; k += 200) await db.insert(schema.priceChanges).values(out.slice(k, k + 200)).onConflictDoNothing();
  return out.length;
}
