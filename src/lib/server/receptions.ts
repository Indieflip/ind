import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { priceDiffPct, receptionStatus } from "@/lib/rules";
import { dictFor } from "@/lib/i18n";
import type { SessionUser } from "@/lib/auth";

const lineSchema = z.object({
  productId: z.number().int().nullable(),
  productName: z.string().trim().min(1).max(300),
  unit: z.string().trim().max(40).default("kg"),
  categoryId: z.number().int().nullable(),
  qtyOrdered: z.number().nullable(),
  qtyReceived: z.number().nullable(),
  temperature: z.number().nullable(),
  dlc: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  lot: z.string().max(120).nullable(),
  unitPrice: z.number().nullable(),
  decision: z.enum(["conform", "reserve", "refuse"]),
  reason: z.string().max(60).nullable(),
  photos: z.array(z.string().max(2000)).max(10),
});

export const payloadSchema = z.object({
  clientUuid: z.string().min(8).max(64),
  supplierId: z.number().int().nullable(),
  supplierName: z.string().trim().min(1).max(200),
  deliveredAt: z.string().datetime({ offset: true }),
  blNumber: z.string().max(100).nullable(),
  driverName: z.string().max(100).nullable(),
  truckTemp: z.number().nullable(),
  vehicleClean: z.boolean().nullable(),
  reservesText: z.string().max(5000).nullable(),
  signerName: z.string().max(100).nullable(),
  signature: z.string().max(2000).nullable(),
  blPhotos: z.array(z.string().max(2000)).max(20),
  bakery: z
    .object({ baguette: z.number().nullable(), hamburger: z.number().nullable(), rolls: z.number().nullable(), painDeMie: z.number().nullable() })
    .nullable()
    .optional(),
  lines: z.array(lineSchema).max(300),
});
export type Payload = z.infer<typeof payloadSchema>;

const reasonToAnomaly: Record<string, (typeof schema.anomalyTypeEnum.enumValues)[number]> = {
  missing: "missing",
  quantity: "quantity",
  temperature: "temperature",
  dlc: "dlc",
  damaged: "damaged",
  label: "damaged",
  aspect: "damaged",
  not_ordered: "wrong_product",
  wrong_product: "wrong_product",
  other: "other",
};

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Dict = ReturnType<typeof dictFor>;

/** Fournisseur : existant, retrouvé par son nom, ou créé (« Autre fournisseur ») */
async function resolveSupplier(tx: Tx, p: Payload) {
  let supplierId = p.supplierId;
  let supplierName = p.supplierName;
  if (supplierId) {
    const s = await tx.query.suppliers.findFirst({ where: eq(schema.suppliers.id, supplierId) });
    if (!s) supplierId = null;
    else supplierName = s.name;
  }
  if (!supplierId) {
    const found = await tx.query.suppliers.findFirst({ where: eq(sql`lower(${schema.suppliers.name})`, supplierName.toLowerCase()) });
    supplierId = found?.id ?? (await tx.insert(schema.suppliers).values({ name: supplierName }).returning())[0].id;
  }
  return { supplierId, supplierName };
}

function headerValues(p: Payload) {
  return {
    deliveredAt: new Date(p.deliveredAt),
    blNumber: p.blNumber || null,
    driverName: p.driverName || null,
    truckTemp: p.truckTemp,
    vehicleClean: p.vehicleClean,
    status: receptionStatus(p.lines.map((l) => l.decision)),
    reservesText: p.reservesText || null,
    signerName: p.signerName || null,
    signatureUrl: p.signature,
  };
}

/**
 * Écrit le contenu d'un bon : photos, lignes, mercurial, suivi des prix et anomalies.
 * `keep` : anomalies déjà traitées (réclamées…) conservées lors d'une modification — on ne les recrée pas.
 * `claims` : réclamations déjà saisies sur les écarts de prix, à reporter sur les nouvelles lignes.
 */
async function writeContent(
  tx: Tx,
  recId: number,
  supplier: { supplierId: number; supplierName: string },
  p: Payload,
  user: SessionUser,
  t: Dict,
  keep: { products: Set<string>; hygiene: boolean; missingBl?: boolean } = { products: new Set(), hygiene: false },
  claims: Map<number, string> = new Map(),
  /** Modification : produits dont le prix du bon n'a pas changé → ni écart ni mercurial touchés (prix de référence d'origine conservé) */
  unchanged: Map<number, number | null> = new Map(),
) {
  const { supplierId, supplierName } = supplier;
  const date = new Date(p.deliveredAt);

  for (const url of p.blPhotos) {
    await tx.insert(schema.receptionPhotos).values({ receptionId: recId, kind: "bl", url });
  }

  // Suivi boulangerie : une ligne par bon (date de livraison)
  await tx.delete(schema.bakeryEntries).where(eq(schema.bakeryEntries.receptionId, recId));
  const b = p.bakery;
  if (b && Object.values(b).some((v) => v != null)) {
    const s = (v: number | null) => (v != null ? String(v) : null);
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(date);
    await tx.insert(schema.bakeryEntries).values({ receptionId: recId, date: day, baguette: s(b.baguette), hamburger: s(b.hamburger), rolls: s(b.rolls), painDeMie: s(b.painDeMie) });
  }

  // Unités saisies pendant le bon : ajoutées à la liste des unités
  for (const unit of new Set(p.lines.map((l) => l.unit.trim()).filter(Boolean))) {
    await tx.insert(schema.units).values({ name: unit }).onConflictDoNothing();
  }

  let position = 0;
  for (const l of p.lines) {
    let product = l.productId ? await tx.query.products.findFirst({ where: eq(schema.products.id, l.productId) }) : undefined;

    if (!product) {
      // Produit hors liste : on le cherche chez ce fournisseur, sinon on l'ajoute au mercurial
      product = await tx.query.products.findFirst({
        where: and(eq(schema.products.supplierId, supplierId), eq(sql`lower(${schema.products.name})`, l.productName.toLowerCase())),
      });
      if (!product) {
        [product] = await tx
          .insert(schema.products)
          .values({ supplierId, name: l.productName, unit: l.unit || "kg", categoryId: l.categoryId, price: l.unitPrice != null ? String(l.unitPrice) : null })
          .returning();
        if (l.unitPrice != null) {
          await tx.insert(schema.priceChanges).values({
            supplierId, supplierName, productId: product.id, productName: product.name, unit: product.unit,
            oldPrice: null, newPrice: String(l.unitPrice), pct: null, type: "new_product", source: "reception",
            receptionId: recId, createdBy: user.id, date, claim: claims.get(product.id) ?? null,
          });
        }
      }
    }
    const productId = product.id;
    const keepPrice = unchanged.has(productId);
    const mercurial = keepPrice ? unchanged.get(productId)! : num(product.price);

    // Suivi des prix : tout écart crée une ligne et met le mercurial à jour
    if (l.unitPrice != null && !keepPrice) {
      if (mercurial == null) {
        await tx.update(schema.products).set({ price: String(l.unitPrice) }).where(eq(schema.products.id, productId));
      } else if (Math.abs(l.unitPrice - mercurial) > 0.00005) {
        await tx.insert(schema.priceChanges).values({
          supplierId, supplierName, productId, productName: product.name, unit: product.unit,
          oldPrice: String(mercurial), newPrice: String(l.unitPrice), pct: priceDiffPct(l.unitPrice, mercurial),
          type: l.unitPrice > mercurial ? "increase" : "decrease", source: "reception",
          receptionId: recId, createdBy: user.id, date, claim: claims.get(productId) ?? null,
        });
        await tx.update(schema.products).set({ price: String(l.unitPrice) }).where(eq(schema.products.id, productId));
      }
    }

    const [line] = await tx
      .insert(schema.receptionLines)
      .values({
        receptionId: recId,
        productId,
        productName: l.productName,
        unit: l.unit,
        categoryId: l.categoryId,
        qtyOrdered: l.qtyOrdered != null ? String(l.qtyOrdered) : null,
        qtyReceived: l.qtyReceived != null ? String(l.qtyReceived) : null,
        temperature: l.temperature,
        dlc: l.dlc,
        lot: l.lot || null,
        unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
        mercurialPrice: mercurial != null ? String(mercurial) : null,
        decision: l.decision,
        reason: l.reason,
        position: position++,
      })
      .returning();

    for (const url of l.photos) {
      await tx.insert(schema.receptionPhotos).values({ receptionId: recId, lineId: line.id, kind: "issue", url });
    }

    // Onglet Anomalies : une anomalie par produit en réserve ou refusé
    if (l.decision !== "conform" && !keep.products.has(l.productName.toLowerCase())) {
      const reasonLabel = l.reason ? (t.reasons as Record<string, string>)[l.reason] ?? l.reason : t.decision[l.decision];
      let detail = "";
      if (l.qtyOrdered != null && l.qtyReceived != null && l.qtyReceived !== l.qtyOrdered) {
        const diff = Math.round((l.qtyReceived - l.qtyOrdered) * 1000) / 1000;
        detail = ` (${diff > 0 ? "+" : ""}${diff} ${l.unit})`;
      }
      await tx.insert(schema.anomalies).values({
        receptionId: recId,
        lineId: line.id,
        supplierId,
        supplierName,
        productName: l.productName,
        type: (l.reason && reasonToAnomaly[l.reason]) || (l.qtyReceived != null && l.qtyOrdered != null && l.qtyReceived < l.qtyOrdered ? "missing" : "other"),
        description: `${t.decision[l.decision]} — ${l.productName} : ${reasonLabel}${detail}`,
        photoUrl: l.photos[0] ?? null,
        createdBy: user.id,
        createdAt: date,
      });
    }
  }

  // Un bon sans BL (ni numéro ni photo) est une anomalie
  if (!p.blNumber?.trim() && p.blPhotos.length === 0 && !keep.missingBl) {
    await tx.insert(schema.anomalies).values({
      receptionId: recId, supplierId, supplierName, type: "missing_bl",
      description: t.anomalies.autoMissingBl, createdBy: user.id, createdAt: date,
    });
  }

  if (p.vehicleClean === false && !keep.hygiene) {
    await tx.insert(schema.anomalies).values({
      receptionId: recId, supplierId, supplierName, type: "hygiene",
      description: `${t.wizard.vehicleClean} ${t.common.no}`, createdBy: user.id, createdAt: date,
    });
  }
}

/** Enregistre une réception complète (idempotent grâce à clientUuid). */
export async function saveReception(p: Payload, user: SessionUser): Promise<number> {
  const db = getDb();
  const t = dictFor(user.locale);

  const existing = await db.query.receptions.findFirst({ where: eq(schema.receptions.clientUuid, p.clientUuid), columns: { id: true } });
  if (existing) return existing.id;

  return db.transaction(async (tx) => {
    const supplier = await resolveSupplier(tx, p);
    const [rec] = await tx
      .insert(schema.receptions)
      .values({ clientUuid: p.clientUuid, ...supplier, ...headerValues(p), createdBy: user.id })
      .returning();
    await writeContent(tx, rec.id, supplier, p, user, t);
    return rec.id;
  });
}

/**
 * Modifie un bon existant. Le contenu est réécrit, en annulant d'abord ses effets :
 * - prix du mercurial remis à leur valeur d'avant le bon (si personne ne les a changés depuis),
 *   écarts de prix supprimés puis recalculés (les réclamations déjà saisies sont conservées) ;
 * - anomalies encore « ouvertes » supprimées puis recalculées ; celles déjà traitées sont gardées.
 */
export class LockedError extends Error {}

export async function updateReception(id: number, p: Payload, user: SessionUser): Promise<number | null> {
  const db = getDb();
  const t = dictFor(user.locale);
  return db.transaction(async (tx) => {
    const rec = await tx.query.receptions.findFirst({ where: eq(schema.receptions.id, id) });
    if (!rec) return null;
    if (rec.consolidatedAt) throw new LockedError("consolidated");

    // 1. Prix : on ne revient que sur les produits dont le prix du bon a changé.
    //    Les autres gardent leur écart d'origine et le mercurial n'est pas touché
    //    (il a pu évoluer depuis, par une autre livraison ou une correction).
    const oldLines = await tx.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id));
    const unchanged = new Map<number, number | null>();
    for (const nl of p.lines) {
      if (!nl.productId) continue;
      const ol = oldLines.find((o) => o.productId === nl.productId);
      if (ol && num(ol.unitPrice) === nl.unitPrice) unchanged.set(nl.productId, num(ol.mercurialPrice));
    }
    const changes = await tx
      .select()
      .from(schema.priceChanges)
      .where(and(eq(schema.priceChanges.receptionId, id), eq(schema.priceChanges.source, "reception")))
      .orderBy(desc(schema.priceChanges.id));
    const claims = new Map<number, string>();
    for (const c of changes) {
      if (!c.productId || unchanged.has(c.productId)) continue;
      if (c.claim) claims.set(c.productId, c.claim);
      const product = await tx.query.products.findFirst({ where: eq(schema.products.id, c.productId) });
      if (product && c.type !== "new_product" && num(product.price) === num(c.newPrice)) {
        await tx.update(schema.products).set({ price: c.oldPrice }).where(eq(schema.products.id, c.productId));
      }
      await tx.delete(schema.priceChanges).where(eq(schema.priceChanges.id, c.id));
    }

    // 2. Anomalies : on garde celles déjà traitées
    const anomalies = await tx.select().from(schema.anomalies).where(eq(schema.anomalies.receptionId, id));
    const keep = { products: new Set<string>(), hygiene: false, missingBl: false };
    for (const a of anomalies) {
      if (a.status === "open") continue;
      if (a.type === "missing_bl") keep.missingBl = true;
      else if (a.type === "hygiene" && !a.productName) keep.hygiene = true;
      else if (a.productName) keep.products.add(a.productName.toLowerCase());
    }
    await tx.delete(schema.anomalies).where(and(eq(schema.anomalies.receptionId, id), eq(schema.anomalies.status, "open")));

    // 3. Réécrire le contenu
    await tx.delete(schema.receptionPhotos).where(eq(schema.receptionPhotos.receptionId, id));
    await tx.delete(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id));
    const supplier = await resolveSupplier(tx, p);
    await tx
      .update(schema.receptions)
      .set({ ...supplier, ...headerValues(p), updatedBy: user.id, updatedAt: new Date() })
      .where(eq(schema.receptions.id, id));
    await writeContent(tx, id, supplier, p, user, t, keep, claims, unchanged);
    return id;
  });
}
