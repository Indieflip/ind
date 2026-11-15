import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { bestMatch } from "@/lib/fuzzy";
import { nameKey, normalize } from "@/lib/search";
import { shortDates } from "@/lib/format";
import { getSetting, setSetting } from "@/lib/settings";

type Row = typeof schema.majLog.$inferSelect;

const lines = (s: string | null) => (s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const deApos = (s: string) => s.replace(/['’]s\b/gi, "s");

/** Mots de rapprochement d'un fournisseur : « GINEYS (PRIX NET) » → gineys ; « SNDA - QUAROLL » → snda, quaroll */
function aliases(name: string) {
  const out = new Set<string>();
  const add = (x: string) => { const k = nameKey(deApos(x)); if (normalize(x).length >= 3) out.add(k); };
  add(name);
  const base = name.split("(")[0];
  add(base);
  // Sans article ni forme juridique : « LES MAITRES AFFINEURS » → « Maitre affineurs », « LA POISSONNERIE SAS » → « La Poissonnerie »
  const bare = normalize(base).replace(/\b(sas|sasu|sarl|sa|ets|eurl)\b/g, "").trim();
  add(bare);
  add(bare.replace(/^(les|la|le|l)\s+/, ""));
  // Sigle en tête : « JFC FRANCE » → JFC
  const head = base.trim().split(/\s+/)[0] ?? "";
  if (/^[A-Z0-9.]{3,}$/.test(head) && base.trim().split(/\s+/).length > 1) add(head);
  for (const part of base.split(/\s[-–]\s/)) add(part);
  const inner = /\(([^)]*)\)/.exec(name)?.[1];
  if (inner && !/prix|ttc|net/i.test(inner)) for (const part of inner.split(/[,/]/)) add(part);
  // « Producteurs Réunis » s'écrit aussi « Producteur Réunis » ou « Prod réunis »
  const words = nameKey(deApos(base)).split(" ").filter(Boolean);
  if (words.length >= 2) add(`${words[0].slice(0, 4)} ${words.slice(1).join(" ")}`);
  return [...out];
}

const keyText = (s: string) => ` ${nameKey(deApos(s))} `;

/** Pays d'origine cités dans un libellé (« ESP » = Espagne) */
const COUNTRIES: [string, RegExp][] = [
  ["ESPAGNE", /\b(espagne|esp)\b/], ["ITALIE", /\b(italie|ita)\b/], ["FRANCE", /\bfrance\b/], ["BELGIQUE", /\bbelgique\b/],
  ["MAROC", /\bmaroc\b/], ["PEROU", /\bperou\b/], ["KENYA", /\bkenya\b/], ["EQUATEUR", /\bequateur\b/], ["CAMEROUN", /\bcameroun\b/],
  ["PANAMA", /\bpanama\b/], ["COSTA RICA", /\bcosta rica\b/], ["TURQUIE", /\bturquie\b/], ["ARGENTINE", /\bargentine\b/], ["PORTUGAL", /\bportugal\b/],
  ["PAYS-BAS", /\b(pays bas|hollande)\b/], ["ALLEMAGNE", /\ballemagne\b/], ["SENEGAL", /\bsenegal\b/], ["ECOSSE", /\becosse\b/], ["NORVEGE", /\bnorvege\b/],
  ["THAILANDE", /\bthailande\b/], ["ISRAEL", /\bisrael\b/], ["EGYPTE", /\begypte\b/], ["AFRIQUE DU SUD", /\b(afrique du sud|sud africaine)\b/],
  ["CROATIE", /\bcroatie\b/], ["GRECE", /\bgrece\b/], ["IRLANDE", /\birlande\b/], ["ROYAUME-UNI", /\b(royaume uni|angleterre|uk)\b/], ["DANEMARK", /\bdanemark\b/],
  ["POLOGNE", /\bpologne\b/], ["HONGRIE", /\bhongrie\b/], ["ISLANDE", /\bislande\b/], ["VIETNAM", /\bvietnam\b/], ["INDE", /\binde\b/], ["CHINE", /\bchine\b/],
  ["MADAGASCAR", /\bmadagascar\b/], ["COTE D'IVOIRE", /\bcote d ivoire\b/], ["TUNISIE", /\btunisie\b/], ["ALGERIE", /\balgerie\b/], ["ETATS-UNIS", /\b(etats unis|usa)\b/],
  ["CANADA", /\bcanada\b/], ["AUSTRALIE", /\baustralie\b/], ["JAPON", /\bjapon\b/], ["URUGUAY", /\buruguay\b/], ["IRAN", /\biran\b/], ["NIGERIA", /\bnigeria\b/],
  ["CHILI", /\bchili\b/], ["BRESIL", /\bbresil\b/], ["MEXIQUE", /\bmexique\b/], ["COLOMBIE", /\bcolombie\b/], ["NOUVELLE-ZELANDE", /\bnouvelle zelande\b/],
];
const countriesOf = (s: string) => { const n = normalize(s); return COUNTRIES.filter(([, re]) => re.test(n)).map(([c]) => c); };

/**
 * Colonne « BL / Facture » : sans le nom du fournisseur (il a sa colonne) et sans « à partir » :
 * « à partir facture 03618124 du 09/06/26 » → « Facture 03618124 du 09/06/26 » ;
 * « GINEYS: Facture 03797191 » → « Facture 03797191 » ; « Facture Giney's 03673866 » → « Facture 03673866 ».
 */
export function cleanReference(ref: string | null, supplierKeys: string[]) {
  if (!ref) return ref;
  let s = ref.replace(/\s+/g, " ").trim();
  s = s.replace(/^[àa] partir (de la |du |de |d'une |d’une )?/i, "");
  // Préfixe « Fournisseur : » ou « Fournisseur / » (sans chiffre)
  const pre = /^([^:/\d]{2,60})\s*[:/]\s*(.+)$/.exec(s);
  if (pre && /[a-z]/i.test(pre[1]) && !/^(bl|facture|commande|bon|avoir)\b/i.test(pre[1].trim())) s = pre[2];
  // Nom du fournisseur au milieu du texte
  const words = s.split(" ");
  const keys = new Set(supplierKeys);
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    let skip = 0;
    for (let len = Math.min(5, words.length - i); len >= 1; len--) {
      const k = nameKey(deApos(words.slice(i, i + len).join(" ")));
      if (k && keys.has(k)) { skip = len; break; }
    }
    if (skip) i += skip;
    else out.push(words[i++]);
  }
  s = out.join(" ").replace(/\bbond? de livraison\b/gi, "BL").replace(/\bfacture\b/gi, "Facture").replace(/^[\s:/-]+|[\s:/-]+$/g, "").replace(/\s+/g, " ");
  s = s.replace(/\(\s*\)/g, "").trim();
  s = shortDates(s);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ref;
}

/** Prix du détail : « Augmentation de 4,83€ à 5,36€ » → 5,36 ; « Rajout produit : 7,50€ » → 7,50 */
function priceOf(detail: string | null) {
  if (!detail) return null;
  const m = /\bà\s*([\d]+(?:[.,]\d+)?)/i.exec(detail) ?? /:\s*([\d]+(?:[.,]\d+)?)/.exec(detail);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/**
 * Historique des modifications du Mercurial :
 * une ligne par produit (les cellules à plusieurs produits sont éclatées en reprenant les autres colonnes),
 * rapprochement des colonnes Fournisseur et Produit avec les listes du mercurial,
 * colonne BL / Facture nettoyée. Un produit d'une autre origine que celui du mercurial devient un nouveau produit.
 */
export async function normalizeMajLog() {
  const db = getDb();
  const [rows, suppliers, products] = await Promise.all([
    db.select().from(schema.majLog).orderBy(asc(schema.majLog.position), asc(schema.majLog.id)),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers),
    db.select().from(schema.products),
  ]);
  const supAliases = suppliers.map((s) => ({ ...s, keys: aliases(s.name) }));
  const allKeys = supAliases.flatMap((s) => s.keys);
  const findSupplier = (text: string) => {
    const t = keyText(text);
    let best: { id: number; len: number } | null = null;
    for (const s of supAliases) for (const k of s.keys) if (t.includes(` ${k} `) && (!best || k.length > best.len)) best = { id: s.id, len: k.length };
    return best?.id ?? null;
  };
  const digits = (x: string) => normalize(x).split(" ").filter((w) => /\d/.test(w)).map((w) => w.replace(/(gr|g|kg|ml|cl|l|u|x)$/, ""));
  const created: string[] = [];

  const out: Omit<Row, "id" | "createdAt">[] = [];
  for (const r of rows) {
    const items = lines(r.item);
    const details = lines(r.detail);
    const parts = items.length > 1 ? items.map((it, i) => ({ item: it, detail: details.length === items.length ? details[i] : r.detail })) : [{ item: r.item, detail: r.detail }];
    for (const part of parts) {
      const item = part.item?.trim() || null;
      const isSupplierRow = /fournisseur|prestataire/i.test(part.detail ?? "") && !!item && item !== "-";
      let supplierId = isSupplierRow ? findSupplier(item!) : null;
      if (!supplierId && r.reference) supplierId = findSupplier(r.reference.split(/\s:\s|:/)[0]) ?? findSupplier(r.reference);
      if (!supplierId) supplierId = r.supplierId;
      let productId: number | null = null;
      if (item && !isSupplierRow && item !== "-") {
        const n = normalize(item);
        const need = digits(item);
        const origin = countriesOf(item);
        const sameNumbers = (x: { name: string }) => { const have = new Set(digits(x.name)); return need.every((d) => have.has(d)); };
        const sameOrigin = (x: { name: string }) => { const c = countriesOf(x.name); return !origin.length || c.some((k) => origin.includes(k)); };
        const own = supplierId ? products.filter((p) => p.supplierId === supplierId) : [];
        const exact = own.find((p) => normalize(p.name) === n) ?? products.find((p) => normalize(p.name) === n);
        let p =
          exact ??
          (own.length ? bestMatch(item, own.filter((x) => sameNumbers(x) && sameOrigin(x)), (x) => x.name, 0.7) : undefined) ??
          bestMatch(item, products.filter((x) => sameNumbers(x) && sameOrigin(x)), (x) => x.name, 0.8);
        if (!p && own.length && origin.length) {
          // Même produit, autre origine (« Courgette … ESP » / « Courgette … (ITALIE) ») : nouveau produit au mercurial
          const twin = bestMatch(item, own.filter(sameNumbers), (x) => x.name.replace(/\([^)]*\)/g, ""), 0.6);
          if (twin) {
            const name = `${twin.name.replace(/\s*\([^)]*\)\s*$/, "").trim()} (${origin.join(" ou ")})`;
            p = products.find((x) => x.supplierId === twin.supplierId && normalize(x.name) === normalize(name));
            if (!p) {
              const price = priceOf(part.detail);
              const [np] = await db
                .insert(schema.products)
                .values({ supplierId: twin.supplierId, name, unit: twin.unit, categoryId: twin.categoryId, service: twin.service, nature: twin.nature, price: price != null ? String(price) : null, priceMin: price != null ? String(price) : null })
                .returning();
              products.push(np);
              created.push(name);
              p = np;
            }
          }
        }
        if (p) {
          productId = p.id;
          if (!supplierId) supplierId = p.supplierId;
        }
      }
      out.push({ date: r.date, nature: r.nature, item, detail: part.detail, reference: cleanReference(r.reference, allKeys), claim: r.claim, supplierId, productId, position: out.length });
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.majLog);
    for (let k = 0; k < out.length; k += 200) await tx.insert(schema.majLog).values(out.slice(k, k + 200));
  });
  return { rows: out.length, suppliers: out.filter((r) => r.supplierId).length, products: out.filter((r) => r.productId).length, created };
}

/** Une seule fois sur les données déjà importées (relancé à chaque évolution de la règle) */
export async function ensureMajNormalized() {
  if (await getSetting("maj_normalized_v4")) return;
  await normalizeMajLog();
  await setSetting("maj_normalized_v4", "1");
}

/** Rapprochement d'un texte (« Supviande », « Giney's », « Producteur Réunis »…) avec la liste des fournisseurs */
export async function supplierMatcher() {
  const suppliers = await getDb().select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers);
  const list = suppliers.map((s) => ({ ...s, keys: aliases(s.name) }));
  const keys = list.flatMap((s) => s.keys);
  const find = (text: string | null | undefined) => {
    if (!text) return null;
    const t = keyText(text);
    let best: { id: number; len: number } | null = null;
    for (const s of list) for (const k of s.keys) if (t.includes(` ${k} `) && (!best || k.length > best.len)) best = { id: s.id, len: k.length };
    return best?.id ?? null;
  };
  return { find, keys, name: (id: number | null) => suppliers.find((s) => s.id === id)?.name ?? null };
}

/** Anomalies reprises du fichier : fournisseur rattaché à la liste et nom retiré de la colonne BL / Facture (une seule fois) */
export async function ensureAnomaliesLinked() {
  if (await getSetting("anomalies_linked_v1")) return;
  const m = await supplierMatcher();
  const db = getDb();
  const rows = await db.select().from(schema.anomalies);
  for (const a of rows) {
    if (a.receptionId) continue;
    const supplierId = a.supplierId ?? m.find(a.supplierName) ?? m.find(a.reference);
    const reference = cleanReference(a.reference, m.keys);
    if (supplierId !== a.supplierId || reference !== a.reference) {
      await db.update(schema.anomalies).set({ supplierId, reference }).where(eq(schema.anomalies.id, a.id));
    }
  }
  await setSetting("anomalies_linked_v1", "1");
}

type ProductLite = { id: number; name: string; supplierId: number };

/** Produit du mercurial correspondant à un libellé (mêmes nombres et même origine exigés pour un rapprochement approché) */
export function matchProduct(item: string, supplierId: number | null, products: ProductLite[]) {
  const n = normalize(item);
  if (!n) return undefined;
  const digits = (x: string) => normalize(x).split(" ").filter((w) => /\d/.test(w)).map((w) => w.replace(/(gr|g|kg|ml|cl|l|u|x)$/, ""));
  const need = digits(item);
  const origin = countriesOf(item);
  const ok = (x: { name: string }) => {
    const have = new Set(digits(x.name));
    const c = countriesOf(x.name);
    return need.every((d) => have.has(d)) && (!origin.length || c.some((k) => origin.includes(k)));
  };
  const own = supplierId ? products.filter((p) => p.supplierId === supplierId) : [];
  return (
    own.find((p) => normalize(p.name) === n) ??
    products.find((p) => normalize(p.name) === n) ??
    (own.length ? bestMatch(item, own.filter(ok), (x) => x.name, 0.7) : undefined) ??
    bestMatch(item, products.filter(ok), (x) => x.name, 0.8)
  );
}

/**
 * Écarts de pesée repris du fichier : fournisseur et produit rattachés aux listes du mercurial,
 * colonne BL / Facture sans le nom du fournisseur.
 */
export async function linkWeighGaps(force = false) {
  if (!force && (await getSetting("weigh_linked_v2"))) return;
  const db = getDb();
  const m = await supplierMatcher();
  const products = await db.select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId }).from(schema.products);
  const rows = await db.select().from(schema.weighGaps);
  for (const g of rows) {
    const [sup, ...rest] = (g.supplierRef ?? "").split(/\s+:\s+/);
    const supplierId = g.supplierId ?? m.find(sup) ?? m.find(g.supplierRef);
    const reference = g.reference ?? (cleanReference(rest.join(" : "), m.keys) || null);
    // Les lignes venues d'un bon gardent le produit du bon ; les autres sont rapprochées à nouveau
    const productId = g.receptionId && g.productId ? g.productId : matchProduct(g.product, supplierId, products)?.id ?? null;
    if (supplierId !== g.supplierId || reference !== g.reference || productId !== g.productId) {
      await db.update(schema.weighGaps).set({ supplierId, reference, productId }).where(eq(schema.weighGaps.id, g.id));
    }
  }
  await setSetting("weigh_linked_v2", "1");
}
