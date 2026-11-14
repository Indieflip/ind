import "server-only";
import { and, eq, sql } from "drizzle-orm";
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

/** Enregistre une réception complète (idempotent grâce à clientUuid). */
export async function saveReception(p: Payload, user: SessionUser): Promise<number> {
  const db = getDb();
  const t = dictFor(user.locale);

  const existing = await db.query.receptions.findFirst({ where: eq(schema.receptions.clientUuid, p.clientUuid), columns: { id: true } });
  if (existing) return existing.id;

  return db.transaction(async (tx) => {
    // Fournisseur : existant, retrouvé par son nom, ou créé (« Autre fournisseur »)
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

    const status = receptionStatus(p.lines.map((l) => l.decision));
    const [rec] = await tx
      .insert(schema.receptions)
      .values({
        clientUuid: p.clientUuid,
        supplierId,
        supplierName,
        deliveredAt: new Date(p.deliveredAt),
        blNumber: p.blNumber || null,
        driverName: p.driverName || null,
        truckTemp: p.truckTemp,
        vehicleClean: p.vehicleClean,
        status,
        reservesText: p.reservesText || null,
        signerName: p.signerName || null,
        signatureUrl: p.signature,
        createdBy: user.id,
      })
      .returning();

    for (const url of p.blPhotos) {
      await tx.insert(schema.receptionPhotos).values({ receptionId: rec.id, kind: "bl", url });
    }

    let position = 0;
    for (const l of p.lines) {
      let productId = l.productId;
      let mercurial: number | null = null;
      let product = productId ? await tx.query.products.findFirst({ where: eq(schema.products.id, productId) }) : undefined;

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
              receptionId: rec.id, createdBy: user.id, date: new Date(p.deliveredAt),
            });
          }
        }
      }
      productId = product.id;
      mercurial = num(product.price);

      // Suivi des prix : tout écart crée une ligne et met le mercurial à jour
      if (l.unitPrice != null) {
        if (mercurial == null) {
          await tx.update(schema.products).set({ price: String(l.unitPrice) }).where(eq(schema.products.id, productId));
        } else if (Math.abs(l.unitPrice - mercurial) > 0.00005) {
          await tx.insert(schema.priceChanges).values({
            supplierId, supplierName, productId, productName: product.name, unit: product.unit,
            oldPrice: String(mercurial), newPrice: String(l.unitPrice), pct: priceDiffPct(l.unitPrice, mercurial),
            type: l.unitPrice > mercurial ? "increase" : "decrease", source: "reception",
            receptionId: rec.id, createdBy: user.id, date: new Date(p.deliveredAt),
          });
          await tx.update(schema.products).set({ price: String(l.unitPrice) }).where(eq(schema.products.id, productId));
        }
      }

      const [line] = await tx
        .insert(schema.receptionLines)
        .values({
          receptionId: rec.id,
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
        await tx.insert(schema.receptionPhotos).values({ receptionId: rec.id, lineId: line.id, kind: "issue", url });
      }

      // Onglet Anomalies : une anomalie par produit en réserve ou refusé
      if (l.decision !== "conform") {
        const reasonLabel = l.reason ? (t.reasons as Record<string, string>)[l.reason] ?? l.reason : t.decision[l.decision];
        let detail = "";
        if (l.qtyOrdered != null && l.qtyReceived != null && l.qtyReceived !== l.qtyOrdered) {
          const diff = Math.round((l.qtyReceived - l.qtyOrdered) * 1000) / 1000;
          detail = ` (${diff > 0 ? "+" : ""}${diff} ${l.unit})`;
        }
        await tx.insert(schema.anomalies).values({
          receptionId: rec.id,
          lineId: line.id,
          supplierId,
          supplierName,
          productName: l.productName,
          type: (l.reason && reasonToAnomaly[l.reason]) || (l.qtyReceived != null && l.qtyOrdered != null && l.qtyReceived < l.qtyOrdered ? "missing" : "other"),
          description: `${t.decision[l.decision]} — ${l.productName} : ${reasonLabel}${detail}`,
          photoUrl: l.photos[0] ?? null,
          createdBy: user.id,
          createdAt: new Date(p.deliveredAt),
        });
      }
    }

    if (p.vehicleClean === false) {
      await tx.insert(schema.anomalies).values({
        receptionId: rec.id, supplierId, supplierName, type: "hygiene",
        description: `${t.wizard.vehicleClean} ${t.common.no}`, createdBy: user.id, createdAt: new Date(p.deliveredAt),
      });
    }

    return rec.id;
  });
}
