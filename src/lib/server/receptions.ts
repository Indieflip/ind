import "server-only";
import { unitName } from "@/lib/units";
import { nameKey, normalize } from "@/lib/search";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { evaluateLine, receptionStatus } from "@/lib/rules";
import { checkPrice, fvRange, parisMonth, type PriceCheck, type PriceRef } from "@/lib/pricing";

const fmtEuro = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);
import { dictFor } from "@/lib/i18n";
import { docLabel } from "@/lib/documents";
import { natureOfCategory } from "@/lib/nature";
import type { SessionUser } from "@/lib/auth";

const lineSchema = z.object({
  productId: z.number().int().nullable(),
  productName: z.string().trim().min(1).max(300),
  unit: z.string().trim().max(40).default("Kg"),
  categoryId: z.number().int().nullable(),
  qtyOrdered: z.number().nullable(),
  qtyReceived: z.number().nullable(),
  temperature: z.number().nullable(),
  dlc: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  lot: z.string().max(120).nullable(),
  unitPrice: z.number().nullable(),
  priceNotShown: z.boolean().optional(),
  decision: z.enum(["conform", "reserve", "refuse"]),
  reason: z.string().max(60).nullable(),
  photos: z.array(z.string().max(2000)).max(10),
  document: z.string().trim().max(100).nullish(),
  note: z.string().trim().max(500).nullish(),
  ref: z.number().int().nullish(),
  refuseQty: z.number().nullish(),
  refuseUnit: z.string().trim().max(30).nullish(),
  returnQty: z.number().nullish(),
  returnUnit: z.string().trim().max(30).nullish(),
});

export const payloadSchema = z.object({
  clientUuid: z.string().min(8).max(64),
  supplierId: z.number().int().nullable(),
  supplierName: z.string().trim().min(1).max(200),
  deliveredAt: z.string().datetime({ offset: true }),
  blNumber: z.string().max(100).nullable(),
  documents: z.array(z.object({ type: z.enum(["bl", "facture", "autre"]), number: z.string().max(100), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() })).max(10).optional(),
  driverName: z.string().max(100).nullable(),
  truckTemp: z.number().nullable(),
  vehicleClean: z.boolean().nullable(),
  reservesText: z.string().max(5000).nullable(),
  signerName: z.string().max(100).nullable(),
  signature: z.string().max(2000).nullable(),
  driverLeftUnsigned: z.boolean().optional(),
  receiverName: z.string().max(100).nullish(),
  receiverSignature: z.string().max(2000).nullish(),
  blPhotos: z.array(z.string().max(2000)).max(20),
  labelPhotos: z.array(z.string().max(2000)).max(20).optional(),
  bakery: z
    .object({ baguette: z.number().nullable(), hamburger: z.number().nullable(), rolls: z.number().nullable(), painDeMie: z.number().nullable() })
    .nullable()
    .optional(),
  /** Case « BL / Facture manquant » : crée la fiche d'anomalie BL manquant */
  missingBl: z.boolean().optional(),
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
    documents: p.documents?.length ? p.documents : p.blNumber ? [{ type: "bl", number: p.blNumber }] : null,
    driverName: p.driverName || null,
    truckTemp: p.truckTemp,
    vehicleClean: p.vehicleClean,
    status: receptionStatus(p.lines.map((l) => l.decision)),
    reservesText: p.reservesText || null,
    signerName: p.signerName || null,
    signatureUrl: p.signature,
    driverLeftUnsigned: !p.signature && !!p.driverLeftUnsigned,
    receiverName: p.receiverName || null,
    receiverSignatureUrl: p.receiverSignature || null,
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
  keep: { products: Set<string>; hygiene: boolean; missingBl?: boolean; locked?: Set<number>; truck?: boolean } = { products: new Set(), hygiene: false },
  claims: Map<number, string> = new Map(),
  /** Modification : produits dont le prix du bon n'a pas changé → ni écart ni mercurial touchés (prix de référence d'origine conservé) */
  unchanged: Map<number, PriceRef> = new Map(),
  /** Fiche importée modifiée : pas de « BL manquant » automatique (seulement par la case « BL / Facture manquant ») */
  silent = false,
) {
  const { supplierId, supplierName } = supplier;
  const date = new Date(p.deliveredAt);

  for (const url of p.blPhotos) {
    await tx.insert(schema.receptionPhotos).values({ receptionId: recId, kind: "bl", url });
  }
  for (const url of p.labelPhotos ?? []) {
    await tx.insert(schema.receptionPhotos).values({ receptionId: recId, kind: "label", url });
  }

  // Suivi Viande / Poisson : kg facturés des produits de ces catégories, à la date de livraison
  await tx.delete(schema.meatFishEntries).where(eq(schema.meatFishEntries.receptionId, recId));
  const cats = await tx.select().from(schema.categories);
  const kindOf = (cid: number | null) => {
    const code = cats.find((c) => c.id === cid)?.code;
    return code === "meat" ? "viande" : code === "fish" ? "poisson" : null;
  };
  const deliveryDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(date);
  // Nature courte, comme dans le fichier de suivi : Viande, Poisson, Fruits & Légumes…
  const SHORT: Record<string, string> = { meat: "Viande", fish: "Poisson", produce: "Fruits & Légumes" };
  const natureOf = (cid: number | null) => { const c = cats.find((x) => x.id === cid); return c ? SHORT[c.code] ?? c.nameFr : null; };
  const firstDoc = p.documents?.[0] ?? (p.blNumber ? { type: "bl" as const, number: p.blNumber } : null);
  /** Référence du document (« BL 123 », « Facture 456 ») reprise sur les anomalies */
  // « Facture 123 du 12/11/26 » : type, numéro et date du document
  const docRef = firstDoc ? docLabel(firstDoc) : null;
  /** Référence du document propre à une ligne (saisie par BL / par facture) */
  const lineRef = (l: { document?: string | null }) => {
    const d = l.document ? p.documents?.find((x) => x.number === l.document) : null;
    return d ? docLabel(d) : docRef;
  };
  for (const l of p.lines) {
    const kind = kindOf(l.categoryId);
    const qty = l.qtyOrdered ?? l.qtyReceived; // quantité facturée (BL / facture)
    if (!kind || qty == null || qty === 0 || l.decision === "refuse") continue;
    await tx.insert(schema.meatFishEntries).values({ kind, date: deliveryDay, product: l.productName, unit: l.unit, qty: String(qty), receptionId: recId, supplierName });
  }

  // Écarts de pesée : produit au kg dont le poids contrôlé diffère du poids facturé (en moins ou en plus),
  // au-delà de la marge acceptée (10 g ou 0,10 €). Ces écarts sont regroupés en une fiche d'anomalie « Écart de pesée » par bon.
  // Le détail, la réclamation et la perte acceptable déjà saisis sont conservés si le bon est modifié.
  const oldGaps = await tx.select().from(schema.weighGaps).where(eq(schema.weighGaps.receptionId, recId));
  await tx.delete(schema.weighGaps).where(eq(schema.weighGaps.receptionId, recId));
  // Perte acceptable du produit (compte produit, en %) : retirée de l'écart (ex. poisson fileté)
  const lossPct = new Map<number, number>();
  const ids = p.lines.map((l) => l.productId).filter((x): x is number => !!x);
  if (ids.length) for (const r of await tx.select({ id: schema.products.id, pct: schema.products.acceptableLossPct }).from(schema.products).where(inArray(schema.products.id, ids))) if (num(r.pct)) lossPct.set(r.id, num(r.pct)!);
  for (const l of p.lines) {
    if (unitName(l.unit) !== "Kg" || l.qtyOrdered == null || l.qtyReceived == null) continue;
    const pct = l.productId ? lossPct.get(l.productId) ?? 0 : 0;
    const loss = pct ? Math.round(l.qtyOrdered * pct * 10) / 1000 : 0;
    const gapQty = Math.round((l.qtyOrdered - l.qtyReceived - loss) * 1000) / 1000;
    const gapAmount = l.unitPrice != null ? Math.round(gapQty * l.unitPrice * 10000) / 10000 : null;
    if (gapQty === 0) continue;
    if (Math.abs(gapQty) <= 0.01 && (gapAmount == null || Math.abs(gapAmount) <= 0.1)) continue;
    const prev = oldGaps.find((g) => g.product.toLowerCase() === l.productName.toLowerCase());
    await tx.insert(schema.weighGaps).values({
      date: deliveryDay,
      nature: natureOf(l.categoryId),
      supplierRef: lineRef(l) ? `${supplierName} : ${lineRef(l)}` : supplierName,
      supplierId,
      productId: l.productId,
      reference: lineRef(l),
      product: l.productName,
      qtyInvoiced: String(l.qtyOrdered),
      unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
      qtyWeighed: String(l.qtyReceived),
      gapQty: String(gapQty),
      gapAmount: gapAmount != null ? String(gapAmount) : null,
      acceptableLoss: loss ? String(loss) : prev?.acceptableLoss ?? null,
      detail: prev?.detail ?? null,
      claimDate: prev?.claimDate ?? null,
      receptionId: recId,
    });
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
  for (const l of p.lines) l.unit = unitName(l.unit) || "Pièce";
  for (const unit of new Set(p.lines.map((l) => l.unit).filter(Boolean))) {
    await tx.insert(schema.units).values({ name: unit }).onConflictDoNothing();
  }

  let position = 0;
  for (const l of p.lines) {
    let product = l.productId ? await tx.query.products.findFirst({ where: eq(schema.products.id, l.productId) }) : undefined;

    if (!product) {
      // Produit hors liste : on le cherche chez ce fournisseur, sinon on l'ajoute au mercurial
      // (accents, majuscules et ponctuation ignorés pour ne pas créer de doublon)
      const sameSupplier = await tx.select().from(schema.products).where(eq(schema.products.supplierId, supplierId));
      product = sameSupplier.find((x) => normalize(x.name) === normalize(l.productName));
      if (!product) {
        [product] = await tx
          .insert(schema.products)
          .values({ supplierId, name: l.productName, unit: l.unit || "Kg", categoryId: l.categoryId, nature: natureOfCategory(cats.find((c) => c.id === l.categoryId)?.code), price: l.unitPrice != null ? String(l.unitPrice) : null })
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
    const fv = product.fvItemId ? await tx.query.fvItems.findFirst({ where: eq(schema.fvItems.id, product.fvItemId) }) : undefined;
    const month = parisMonth(date);
    // Tranche de référence : mercurial (min « - » / max « + ») ou fruits et légumes du mois de livraison
    const current: PriceRef = fv
      ? { ...fvRange(fv.prices, month), locked: fv.locked }
      : { min: num(product.priceMin), max: num(product.price), locked: product.priceLocked };
    const keepPrice = unchanged.has(productId);
    const ref: PriceRef = keepPrice ? unchanged.get(productId)! : current;
    const check = keepPrice ? ({ kind: "ok" } as PriceCheck) : checkPrice(l.unitPrice, ref);

    /** Met à jour la borne min ou max de la référence (mercurial ou mois des fruits et légumes) */
    const setBound = async (bound: "min" | "max", value: number) => {
      if (fv) {
        const prices = [...fv.prices];
        while (prices.length < 24) prices.push(null);
        prices[month * 2 + (bound === "min" ? 0 : 1)] = value;
        if (bound === "min" && prices[month * 2 + 1] == null) prices[month * 2 + 1] = value;
        if (bound === "max" && prices[month * 2] == null) prices[month * 2] = value;
        await tx.update(schema.fvItems).set({ prices }).where(eq(schema.fvItems.id, fv.id));
        fv.prices = prices;
      } else {
        await tx.update(schema.products).set(bound === "min" ? { priceMin: String(value) } : { price: String(value) }).where(eq(schema.products.id, productId));
      }
    };

    if (l.unitPrice != null && !keepPrice) {
      if (check.kind === "new") {
        // Pas encore de prix de référence : le prix du BL devient la référence
        await setBound("max", l.unitPrice);
      } else if (check.kind === "increase" || check.kind === "decrease") {
        // Hors tranche : variation de prix enregistrée, la borne dépassée est mise à jour
        await tx.insert(schema.priceChanges).values({
          supplierId, supplierName, productId, productName: product.name, unit: product.unit,
          oldPrice: String(check.bound), newPrice: String(l.unitPrice), pct: check.pct,
          type: check.kind, source: "reception",
          receptionId: recId, createdBy: user.id, date, claim: claims.get(productId) ?? null,
        });
        await setBound(check.kind === "increase" ? "max" : "min", l.unitPrice);
        // Prix facturé au moins 10 % au-dessus du mercurial : anomalie de prix (à vérifier / réclamer)
        if (check.kind === "increase" && check.pct >= 10 && !keep.products.has(l.productName.toLowerCase())) {
          await tx.insert(schema.anomalies).values({
            receptionId: recId, supplierId, supplierName, productName: l.productName, type: "price", nature: natureOf(l.categoryId), reference: lineRef(l),
            description: `${t.anomalies.types.price} : ${fmtEuro(l.unitPrice)} ${t.anomalies.texts.insteadOf} ${fmtEuro(check.bound)} (+${String(check.pct).replace(".", ",")} %)`,
            claimedAmount: money((l.unitPrice - check.bound) * (l.qtyReceived ?? l.qtyOrdered ?? 0)),
            createdBy: user.id, createdAt: date,
          });
        }
      } else if (check.kind === "locked" && !keep.locked?.has(productId)) {
        // Prix bloqué : pas de variation, une anomalie à réclamer au fournisseur
        await tx.insert(schema.anomalies).values({
          receptionId: recId, supplierId, supplierName, productName: l.productName, type: "locked_price", nature: natureOf(l.categoryId), reference: lineRef(l),
          claimedAmount: money(l.unitPrice != null && (ref.min ?? ref.max) != null ? (l.unitPrice - (ref.min ?? ref.max)!) * (l.qtyReceived ?? l.qtyOrdered ?? 0) : null),
          description: `${t.anomalies.types.locked_price} : ${fmtEuro(l.unitPrice)} ${t.anomalies.texts.insteadOf} ${fmtEuro(ref.min ?? ref.max)}${ref.min != null && ref.max != null && ref.min !== ref.max ? ` – ${fmtEuro(ref.max)}` : ""} (${check.pct > 0 ? "+" : ""}${String(check.pct).replace(".", ",")} %)`,
          createdBy: user.id, createdAt: date,
        });
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
        mercurialMin: ref.min != null ? String(ref.min) : null,
        mercurialPrice: ref.max != null ? String(ref.max) : null,
        priceLocked: ref.locked,
        decision: l.decision,
        reason: l.reason,
        document: l.document || null,
        note: l.note || null,
        priceNotShown: !!l.priceNotShown,
        refuseQty: l.refuseQty != null ? String(l.refuseQty) : null,
        refuseUnit: l.refuseUnit || null,
        returnQty: l.returnQty != null ? String(l.returnQty) : null,
        returnUnit: l.returnUnit || null,
        returnKind: null,
        returnProduct: null,
        position: position++,
      })
      .returning();

    for (const url of l.photos) {
      await tx.insert(schema.receptionPhotos).values({ receptionId: recId, lineId: line.id, kind: "issue", url });
    }

    // Onglet Anomalies : une anomalie par produit en réserve ou refusé, ou dès qu'un contrôle détecte un problème
    // (température, DLC, quantité), même si le produit a été accepté
    const cat = cats.find((c) => c.id === l.categoryId);
    const detected = evaluateLine(
      { qtyOrdered: l.qtyOrdered, qtyReceived: l.qtyReceived, temperature: l.temperature, dlc: l.dlc, categoryId: l.categoryId },
      cat ? { ...cat, conformMax: cat.conformMax, reserveMax: cat.reserveMax } : undefined,
      date,
    ).issues.filter((i) => i !== "temp_missing" && i !== "temp_limit" && i !== "dlc_short" && !(unitName(l.unit) === "Kg" && (i === "qty_less" || (i === "qty_more" && !kgExtra(l)))));
    // (T° dans la marge acceptable et DLC courte : tolérées, pas d'anomalie)
    // (au kg, un poids manquant va dans la fiche « Écart de pesée » du bon ; un poids en trop, au-delà de la marge, est une quantité en trop)
    // Quantité en trop : à vérifier sur la facture (type de suivi « Sans relance »), montant pour information
    const extraOnly = detected.length > 0 && detected.every((i) => i === "qty_more");
    // Texte clair : « manque 50 pièces (facturé 100, contrôlé 50) », « température 8 °C (maximum 4 °C) »…
    const facts = describeLine(l, detected, cat, t);
    // (Refus / Retour saisis : leurs fiches d'anomalie remplacent l'anomalie détectée)
    if (l.decision === "conform" && l.refuseQty == null && l.returnQty == null && detected.length && !keep.products.has(l.productName.toLowerCase())) {
      const first = detected[0];
      await tx.insert(schema.anomalies).values({
        ...(extraOnly ? { mode: "verification" as const } : {}),
        receptionId: recId, lineId: line.id, supplierId, supplierName, productName: l.productName,
        nature: natureOf(l.categoryId), reference: lineRef(l),
        type: first.startsWith("temp") ? "temperature" : first.startsWith("dlc") ? "dlc" : first === "qty_less" ? "missing" : "quantity",
        // Type « Quantité » supprimé : quantité en trop affichée « Quantité produit »
        ...(first.startsWith("qty") ? { problemType: t.anomalies.types.missing } : {}),
        description: `${t.anomalies.detected} : ${facts.join(" ; ")}`,
        claimedAmount: money(gapValue(l)),
        // Produit de la fiche : quantité en trop / manquante (écart Q Contrôlée – Q Facturée)
        ...(l.qtyOrdered != null && l.qtyReceived != null && l.qtyOrdered !== l.qtyReceived
          ? { items: [{ productId, name: l.productName, qty: Math.round(Math.abs(l.qtyReceived - l.qtyOrdered) * 1000) / 1000, unit: l.unit, price: l.unitPrice }] }
          : {}),
        photoUrl: l.photos[0] ?? null, createdBy: user.id, createdAt: date,
      });
    }
    if ((l.decision !== "conform" || l.refuseQty != null || l.returnQty != null) && !keep.products.has(l.productName.toLowerCase())) {
      const reasonLabel = l.reason ? (t.reasons as Record<string, string>)[l.reason] ?? l.reason : "";
      const qtyFacts = describeLine(l, ["qty_less", "qty_more"], cat, t);
      // Montant d'une quantité refusée / retournée : quantité × prix (seulement dans l'unité de la ligne)
      const valueOf = (q: number, unit: string | null | undefined) => (l.unitPrice != null && (!unit || unitName(unit) === unitName(l.unit)) ? l.unitPrice * q : null);
      const base = {
        receptionId: recId, lineId: line.id, supplierId, supplierName, productName: l.productName,
        nature: natureOf(l.categoryId), reference: lineRef(l),
        type: (l.reason && reasonToAnomaly[l.reason]) || (l.qtyReceived != null && l.qtyOrdered != null && l.qtyReceived < l.qtyOrdered ? ("missing" as const) : ("other" as const)),
        ...(l.reason && reasonToAnomaly[l.reason] === "quantity" ? { problemType: t.anomalies.types.missing } : {}),
        photoUrl: l.photos[0] ?? null, createdBy: user.id, createdAt: date,
      };
      // Refus (produit refusé ou quantité refusée) ou réserve : une fiche d'anomalie, avec la quantité refusée
      if (l.decision !== "conform" || l.refuseQty != null) {
        const fq = l.refuseQty ?? (l.decision === "refuse" ? l.qtyOrdered ?? l.qtyReceived : null);
        const fu = l.refuseUnit || l.unit;
        const why = [fq != null ? qtyText(fq, fu) : "", reasonLabel.toLowerCase(), ...(facts.length ? facts : qtyFacts)].filter(Boolean);
        await tx.insert(schema.anomalies).values({
          ...base,
          description: `${l.refuseQty != null ? t.decision.refuse : t.decision[l.decision]}${why.length ? ` : ${[...new Set(why)].join(" ; ")}` : ""}`,
          claimedAmount: money(fq != null ? valueOf(fq, fu) : gapValue(l)),
          ...(fq != null ? { items: [{ productId, name: l.productName, qty: fq, unit: fu, price: l.unitPrice }] } : {}),
        });
      }
      // Retour : une fiche « Retour marchandise », avec la quantité retournée
      if (l.returnQty != null) {
        const ru = l.returnUnit || l.unit;
        const why = [qtyText(l.returnQty, ru), l.decision !== "conform" || l.refuseQty != null ? "" : reasonLabel.toLowerCase()].filter(Boolean);
        await tx.insert(schema.anomalies).values({
          ...base,
          ...(l.decision !== "conform" || l.refuseQty != null ? { type: "other" as const } : {}),
          problemType: t.wizard.returnProblem,
          description: `${t.wizard.returnBtn} : ${why.join(" ; ")}`,
          claimedAmount: money(valueOf(l.returnQty, ru)),
          items: [{ productId, name: l.productName, qty: l.returnQty, unit: ru, price: l.unitPrice }],
        });
      }
    }
  }

  // Un bon sans BL (ni numéro ni photo) est une anomalie
  // ou case « BL / Facture manquant » cochée sur la fiche
  if ((p.missingBl || (!silent && !p.blNumber?.trim() && p.blPhotos.length === 0)) && !keep.missingBl) {
    await tx.insert(schema.anomalies).values({
      receptionId: recId, supplierId, supplierName, type: "missing_bl", reference: docRef,
      description: p.missingBl ? t.anomalies.boxMissingBl : t.anomalies.autoMissingBl, createdBy: user.id, createdAt: date,
    });
  }

  // Température du camion : sert à proposer la décision des produits frais, sans fiche d'anomalie à part

  if (p.vehicleClean === false && !keep.hygiene) {
    await tx.insert(schema.anomalies).values({
      receptionId: recId, supplierId, supplierName, type: "hygiene", reference: docRef,
      description: `${t.wizard.vehicleClean} ${t.common.no}`, createdBy: user.id, createdAt: date,
    });
  }
}

/** Un numéro de BL / facture ne peut servir qu'à une seule réception par fournisseur */
export class DuplicateDocError extends Error {
  constructor(public info: { receptionId: number; number: string; deliveredAt: Date }) {
    super("duplicate_doc");
  }
}

const docKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

export async function findDocDuplicate(q: { supplierId: number | null; supplierName: string; numbers: string[]; excludeId?: number | null }) {
  const wanted = new Set(q.numbers.map(docKey).filter(Boolean));
  if (!wanted.size) return null;
  const r = schema.receptions;
  const rows = await getDb()
    .select({ id: r.id, supplierId: r.supplierId, supplierName: r.supplierName, blNumber: r.blNumber, documents: r.documents, deliveredAt: r.deliveredAt })
    .from(r)
    .where(q.supplierId ? eq(r.supplierId, q.supplierId) : sql`true`);
  const key = nameKey(q.supplierName);
  for (const x of rows) {
    if (x.id === q.excludeId) continue;
    if (!q.supplierId && nameKey(x.supplierName) !== key) continue;
    const nums = [...(x.documents ?? []).map((d) => d.number), ...(x.blNumber ? [x.blNumber] : [])];
    const hit = nums.find((n) => wanted.has(docKey(n)));
    if (hit) return { receptionId: x.id, number: hit, deliveredAt: x.deliveredAt };
  }
  return null;
}

const payloadNumbers = (p: Payload) => [...(p.documents ?? []).map((d) => d.number), ...(p.blNumber ? [p.blNumber] : [])];

/** Enregistre une réception complète (idempotent grâce à clientUuid). */
export async function saveReception(p: Payload, user: SessionUser): Promise<number> {
  const db = getDb();
  const t = dictFor(user.locale);

  const existing = await db.query.receptions.findFirst({ where: eq(schema.receptions.clientUuid, p.clientUuid), columns: { id: true } });
  if (existing) return existing.id;
  const dup = await findDocDuplicate({ supplierId: p.supplierId, supplierName: p.supplierName, numbers: payloadNumbers(p) });
  if (dup) throw new DuplicateDocError(dup);

  return db.transaction(async (tx) => {
    const supplier = await resolveSupplier(tx, p);
    const [rec] = await tx
      .insert(schema.receptions)
      .values({ clientUuid: p.clientUuid, ...supplier, ...headerValues(p), createdBy: user.id })
      .returning();
    await writeContent(tx, rec.id, supplier, p, user, t);
    await tx.delete(schema.receptionDrafts).where(eq(schema.receptionDrafts.clientUuid, p.clientUuid));
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
  const dup = await findDocDuplicate({ supplierId: p.supplierId, supplierName: p.supplierName, numbers: payloadNumbers(p), excludeId: id });
  if (dup) throw new DuplicateDocError(dup);
  return db.transaction(async (tx) => {
    const rec = await tx.query.receptions.findFirst({ where: eq(schema.receptions.id, id) });
    if (!rec) return null;
    if (rec.consolidatedAt) throw new LockedError("consolidated");

    // 1. Prix : on ne revient que sur les produits dont le prix du bon a changé.
    //    Les autres gardent leur écart d'origine et le mercurial n'est pas touché
    //    (il a pu évoluer depuis, par une autre livraison ou une correction).
    const oldLines = await tx.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id));
    const unchanged = new Map<number, PriceRef>();
    for (const nl of p.lines) {
      if (!nl.productId) continue;
      const ol = oldLines.find((o) => o.productId === nl.productId);
      if (ol && num(ol.unitPrice) === nl.unitPrice) unchanged.set(nl.productId, { min: num(ol.mercurialMin), max: num(ol.mercurialPrice), locked: ol.priceLocked });
    }
    const month = parisMonth(rec.deliveredAt);
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
      if (product && c.type !== "new_product") {
        // On remet la borne modifiée par ce bon, si personne ne l'a changée depuis
        const isMax = c.type === "increase";
        if (product.fvItemId) {
          const fv = await tx.query.fvItems.findFirst({ where: eq(schema.fvItems.id, product.fvItemId) });
          const i = month * 2 + (isMax ? 1 : 0);
          if (fv && fv.prices[i] === num(c.newPrice)) {
            const prices = [...fv.prices];
            prices[i] = num(c.oldPrice);
            await tx.update(schema.fvItems).set({ prices }).where(eq(schema.fvItems.id, fv.id));
          }
        } else if (num(isMax ? product.price : product.priceMin) === num(c.newPrice)) {
          await tx.update(schema.products).set(isMax ? { price: c.oldPrice } : { priceMin: c.oldPrice }).where(eq(schema.products.id, c.productId));
        }
      }
      await tx.delete(schema.priceChanges).where(eq(schema.priceChanges.id, c.id));
    }

    // 2. Anomalies : on garde celles déjà traitées
    const anomalies = await tx.select().from(schema.anomalies).where(eq(schema.anomalies.receptionId, id));
    const keep = { products: new Set<string>(), hygiene: false, missingBl: false, locked: new Set<number>(), truck: false };
    // Une anomalie déjà suivie (action, relance, résultat, consolidation) n'est jamais recréée ni supprimée
    const touched = (a: (typeof anomalies)[number]) => a.stage !== "a_traiter" || a.status !== "open" || !!a.followUp || !!a.nextActionAt || !!a.result || !!a.consolidatedAt || !!a.lastActionAt;
    for (const a of anomalies) {
      if (!touched(a)) continue;
      if (a.type === "missing_bl") keep.missingBl = true;
      else if (a.type === "locked_price") {
        const pr = a.productName ? oldLines.find((o) => o.productName === a.productName) : undefined;
        if (pr?.productId) keep.locked.add(pr.productId);
      }
      else if (a.type === "hygiene" && !a.productName) keep.hygiene = true;
      else if (a.type === "temperature" && !a.productName) keep.truck = true;
      else if (a.productName) keep.products.add(a.productName.toLowerCase());
    }
    // Anomalies importées (fichier de suivi, écarts de pesée) : jamais supprimées par une modification du bon
    const drop = rec.importedFrom ? [] : anomalies.filter((a) => !touched(a) && a.source !== "file" && a.source !== "weigh").map((a) => a.id);
    if (drop.length) await tx.delete(schema.anomalies).where(inArray(schema.anomalies.id, drop));

    // Fiche importée (générée depuis les anomalies importées) : ses fiches d'anomalie suivent la modification.
    // Lignes d'origine de chaque produit de la fiche, repérées avant la réécriture
    const norm = (x: string | null | undefined) => (x ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    // (fiches d'anomalie jamais verrouillées : consolidées comprises)
    const linked = rec.importedFrom ? anomalies.filter((a) => a.source === "file" || a.source === "weigh") : [];
    const fileLinks = linked.filter((a) => a.source === "file").map((a) => {
      const items = a.items?.length ? a.items : [{ productId: a.productId, name: a.productName ?? "", qty: null, unit: "", price: null }];
      return { a, items, lineIds: items.map((it, k) => (k === 0 && !a.items?.length && a.lineId) || oldLines.find((o) => norm(o.productName) === norm(it.name))?.id || null) };
    });

    // Ancienne fiche : un produit qui a déjà sa fiche d'anomalie (même renommé sur la fiche de réception) n'en reçoit pas d'autre,
    // elle est mise à jour ; un produit sans fiche d'anomalie reçoit la sienne
    if (rec.importedFrom) {
      const coveredOld = new Set<number>();
      for (const a of anomalies) {
        if (a.lineId) coveredOld.add(a.lineId);
        for (const n of [a.productName, ...(a.items ?? []).map((it) => it.name)]) {
          if (!n) continue;
          keep.products.add(n.toLowerCase());
          for (const o of oldLines) if (norm(o.productName) === norm(n)) coveredOld.add(o.id);
        }
        if (a.type === "missing_bl") keep.missingBl = true;
        if (a.type === "hygiene" && !a.productName) keep.hygiene = true;
      }
      for (const pl of p.lines) if (pl.ref && coveredOld.has(pl.ref)) { keep.products.add(pl.productName.toLowerCase()); if (pl.productId) keep.locked.add(pl.productId); }
    }

    // 3. Réécrire le contenu
    await tx.delete(schema.receptionPhotos).where(eq(schema.receptionPhotos.receptionId, id));
    await tx.delete(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id));
    const supplier = await resolveSupplier(tx, p);
    await tx
      .update(schema.receptions)
      .set({ ...supplier, ...headerValues(p), updatedBy: user.id, updatedAt: new Date() })
      .where(eq(schema.receptions.id, id));
    await writeContent(tx, id, supplier, p, user, t, keep, claims, unchanged, !!rec.importedFrom);

    if (linked.length) {
      const newLines = await tx.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id)).orderBy(asc(schema.receptionLines.position));
      const byRef = new Map<number, { pl: Payload["lines"][number]; nl: (typeof newLines)[number] }>();
      p.lines.forEach((pl, i) => { if (pl.ref && newLines[i]) byRef.set(pl.ref, { pl, nl: newLines[i] }); });
      const first = p.documents?.[0] ?? (p.blNumber ? { type: "bl" as const, number: p.blNumber } : null);
      const reference = first ? docLabel(first) : null;
      const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
      const at = new Date(p.deliveredAt);
      // Référence reprise seulement si les documents ont été modifiés (« Pas de facture »… gardé sinon)
      const docKey = (d: { type: string; number: string; date?: string | null }[] | null | undefined) => JSON.stringify((d ?? []).map((x) => [x.type, x.number.trim(), x.date ?? null]));
      const docsChanged = docKey(rec.documents as { type: string; number: string; date?: string | null }[] | null) !== docKey(p.documents);
      const common = (a: (typeof linked)[number]) => ({
        supplierId: supplier.supplierId, supplierName: supplier.supplierName, ...(docsChanged ? { reference } : {}),
        // Date de livraison changée : la fiche d'anomalie prend la nouvelle date
        ...(day(a.createdAt) !== day(at) ? { createdAt: at, docDate: first?.date ?? null } : {}),
      });
      for (const { a, items, lineIds } of fileLinks) {
        const next: NonNullable<typeof a.items> = [];
        let lineId: number | null = null;
        items.forEach((it, k) => {
          const old = lineIds[k];
          if (old == null) return void next.push(it);
          const m = byRef.get(old);
          if (!m) return; // ligne supprimée de la fiche de réception : produit retiré de l'anomalie
          const { pl, nl } = m;
          const gap = pl.qtyOrdered != null && pl.qtyReceived != null ? Math.round(Math.abs(pl.qtyOrdered - pl.qtyReceived) * 1000) / 1000 : null;
          // Refus / Retour saisis sur la ligne : leur quantité et leur unité priment sur l'écart facturé / contrôlé
          const rq = pl.refuseQty ?? pl.returnQty;
          const ru = pl.refuseQty != null ? pl.refuseUnit : pl.returnUnit;
          next.push({ productId: nl.productId ?? it.productId, name: pl.productName, qty: rq ?? (gap || it.qty), unit: (rq != null && ru) || pl.unit || it.unit, price: pl.unitPrice ?? it.price });
          lineId ??= nl.id;
        });
        // Montant réclamé = somme des produits (quantité × prix) quand tout est connu ; sinon le montant saisi est gardé
        const amount = next.length && next.every((x) => x.qty != null && x.price != null) ? Math.round(next.reduce((s, x) => s + x.qty! * x.price!, 0) * 100) / 100 : null;
        await tx.update(schema.anomalies).set({
          ...common(a),
          ...(a.items?.length || lineId != null ? { items: next } : {}),
          productName: next.length === 1 ? next[0].name : a.productName,
          productId: next[0]?.productId ?? a.productId,
          claimedAmount: amount != null ? String(amount) : a.claimedAmount,
          lineId,
        }).where(eq(schema.anomalies.id, a.id));
      }
      // Écarts de pesée : détail des produits recalculé depuis les pesées de la fiche (syncWeighAnomalies, juste après)
      for (const a of linked.filter((x) => x.source === "weigh")) {
        await tx.update(schema.anomalies).set({ ...common(a), items: null, groupKey: `rec:${id}` }).where(eq(schema.anomalies.id, a.id));
      }
    }
    return id;
  });
}

/** Produit au kg reçu en trop au-delà de la marge des pesées (10 g ou 0,10 €) */
function kgExtra(l: { qtyOrdered: number | null; qtyReceived: number | null; unitPrice: number | null }) {
  if (l.qtyOrdered == null || l.qtyReceived == null) return false;
  const extra = Math.round((l.qtyReceived - l.qtyOrdered) * 1000) / 1000;
  return extra > 0.01 || (l.unitPrice != null && extra > 0 && extra * l.unitPrice > 0.1);
}

/** Quantité lisible : « 50 pièces », « 2,5 kg », « 1 carton » */
function qtyText(n: number, unit: string) {
  const v = Math.abs(Math.round(n * 1000) / 1000);
  const u = (unit || "").toLowerCase();
  const plural = v > 1 && !/^(kg|g|l|ml|cl)$/.test(u) && !/[sx]$/.test(u) ? `${u}s` : u;
  return `${String(v).replace(".", ",")} ${plural}`.trim();
}

/** Constats clairs d'une ligne de bon, pour la colonne « Problème » des anomalies */
function describeLine(
  l: { qtyOrdered: number | null; qtyReceived: number | null; temperature: number | null; dlc: string | null; unit: string },
  issues: string[],
  cat: { conformMax: number | null; reserveMax: number | null } | undefined,
  t: ReturnType<typeof dictFor>,
) {
  const x = t.anomalies.texts;
  const out: string[] = [];
  const num3 = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
  const dmy = (d: string) => d.split("-").reverse().map((p, i) => (i === 2 ? p.slice(2) : p)).join("/");
  for (const i of issues) {
    if ((i === "qty_less" || i === "qty_more") && l.qtyOrdered != null && l.qtyReceived != null && l.qtyOrdered !== l.qtyReceived) {
      const diff = l.qtyReceived - l.qtyOrdered;
      const q = qtyText(diff, l.unit);
      out.push(`${diff < 0 ? `${x.missing} ${q}` : `${q} ${x.extra}`} (${x.invoiced} ${num3(l.qtyOrdered)}, ${x.checked} ${num3(l.qtyReceived)})`);
    } else if ((i === "temp_over" || i === "temp_limit") && l.temperature != null) {
      const max = cat?.conformMax;
      out.push(`${x.temperature} ${String(l.temperature).replace(".", ",")} °C${max != null ? ` (${x.maximum} ${String(max).replace(".", ",")} °C)` : ""}`);
    } else if (i === "dlc_expired" && l.dlc) out.push(`${x.dlcExpired} (${dmy(l.dlc)})`);
    else if (i === "dlc_short" && l.dlc) out.push(`${x.dlcShort} (${dmy(l.dlc)})`);
  }
  return [...new Set(out)];
}

/** Montant en jeu d'un écart de quantité : quantité manquante (ou en trop) × prix unitaire */
function gapValue(l: { qtyOrdered: number | null; qtyReceived: number | null; unitPrice: number | null }) {
  if (l.unitPrice == null || l.qtyOrdered == null || l.qtyReceived == null || l.qtyOrdered === l.qtyReceived) return null;
  return Math.abs(l.qtyOrdered - l.qtyReceived) * l.unitPrice;
}
const money = (n: number | null) => (n != null && n > 0 ? String(Math.round(n * 100) / 100) : null);
