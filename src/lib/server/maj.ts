import "server-only";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { bestMatch } from "@/lib/fuzzy";
import { nameKey, normalize } from "@/lib/search";
import { getSetting, setSetting } from "@/lib/settings";

type Row = typeof schema.majLog.$inferSelect;

const lines = (s: string | null) => (s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

/** Mots de rapprochement d'un fournisseur : « GINEYS (PRIX NET) » → gineys ; « SNDA - QUAROLL » → snda, quaroll */
function aliases(name: string) {
  const out = new Set<string>();
  const add = (x: string) => { const k = nameKey(x.replace(/['’]s\b/gi, "s")); if (k.length >= 3) out.add(k); };
  add(name);
  const base = name.split("(")[0];
  add(base);
  for (const part of base.split(/\s[-–]\s/)) add(part);
  const inner = /\(([^)]*)\)/.exec(name)?.[1];
  if (inner && !/prix|ttc|net/i.test(inner)) for (const part of inner.split(/[,/]/)) add(part);
  return [...out];
}

const keyText = (s: string) => ` ${nameKey(s.replace(/['’]s\b/gi, "s"))} `;

/**
 * Historique des modifications du Mercurial :
 * une ligne par produit (les cellules à plusieurs produits sont éclatées en reprenant les autres colonnes),
 * puis rapprochement des colonnes Fournisseur et Produit avec les listes du mercurial.
 */
export async function normalizeMajLog() {
  const db = getDb();
  const [rows, suppliers, products] = await Promise.all([
    db.select().from(schema.majLog).orderBy(asc(schema.majLog.position), asc(schema.majLog.id)),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers),
    db.select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId }).from(schema.products),
  ]);
  const supAliases = suppliers.map((s) => ({ ...s, keys: aliases(s.name) }));
  const findSupplier = (text: string) => {
    const t = keyText(text);
    let best: { id: number; len: number } | null = null;
    for (const s of supAliases) for (const k of s.keys) if (t.includes(` ${k} `) && (!best || k.length > best.len)) best = { id: s.id, len: k.length };
    return best?.id ?? null;
  };

  const out: Omit<Row, "id" | "createdAt">[] = [];
  for (const r of rows) {
    const items = lines(r.item);
    const details = lines(r.detail);
    const split = items.length > 1;
    const parts = split ? items.map((it, i) => ({ item: it, detail: details.length === items.length ? details[i] : r.detail })) : [{ item: r.item, detail: r.detail }];
    for (const part of parts) {
      const item = part.item?.trim() || null;
      const isSupplierRow = /fournisseur|prestataire/i.test(part.detail ?? "") && !!item && item !== "-";
      let supplierId = isSupplierRow ? findSupplier(item!) : null;
      if (!supplierId && r.reference) supplierId = findSupplier(r.reference.split(/\s:\s|:/)[0]) ?? findSupplier(r.reference);
      let productId: number | null = null;
      if (item && !isSupplierRow && item !== "-") {
        const n = normalize(item);
        const own = supplierId ? products.filter((p) => p.supplierId === supplierId) : [];
        // Les nombres (calibre, poids, conditionnement) doivent se retrouver dans le produit rapproché
        const digits = (x: string) => normalize(x).split(" ").filter((w) => /\d/.test(w)).map((w) => w.replace(/(gr|g|kg|ml|cl|l|u|x)$/, ""));
        const need = digits(item);
        const sameNumbers = (x: { name: string }) => { const have = new Set(digits(x.name)); return need.every((d) => have.has(d)); };
        const exact = own.find((p) => normalize(p.name) === n) ?? products.find((p) => normalize(p.name) === n);
        const p = exact ?? (own.length ? bestMatch(item, own.filter(sameNumbers), (x) => x.name, 0.6) : undefined) ?? bestMatch(item, products.filter(sameNumbers), (x) => x.name, 0.8);
        if (p) {
          productId = p.id;
          if (!supplierId) supplierId = p.supplierId;
        }
      }
      out.push({ date: r.date, nature: r.nature, item, detail: part.detail, reference: r.reference, claim: r.claim, supplierId, productId, position: out.length });
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.majLog);
    for (let k = 0; k < out.length; k += 200) await tx.insert(schema.majLog).values(out.slice(k, k + 200));
  });
  return { rows: out.length, suppliers: out.filter((r) => r.supplierId).length, products: out.filter((r) => r.productId).length };
}

/** Une seule fois sur les données déjà importées */
export async function ensureMajNormalized() {
  if (await getSetting("maj_normalized_v1")) return;
  await normalizeMajLog();
  await setSetting("maj_normalized_v1", "1");
}
