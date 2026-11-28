import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { dictFor } from "@/lib/i18n";
import { buildReservesText } from "@/components/reception/helpers";
import type { Draft, DraftLine } from "@/lib/reception-types";

const str = (v: unknown) => (v == null ? "" : String(num(v) ?? v));

/** Date au format du champ datetime-local, heure de Paris */
function toLocalInput(d: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(d)
    .replace(" ", "T");
}

/** Fiche de réception existante → brouillon de modification (page de modification complète et modification sur la fiche) */
export async function buildEditDraft(rec: typeof schema.receptions.$inferSelect, locale: string): Promise<Draft> {
  const db = getDb();
  const id = rec.id;
  const [lines, photos, categories, bakery] = await Promise.all([
    db.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id)).orderBy(asc(schema.receptionLines.position)),
    db.select().from(schema.receptionPhotos).where(eq(schema.receptionPhotos.receptionId, id)),
    db.select().from(schema.categories),
    db.query.bakeryEntries.findFirst({ where: eq(schema.bakeryEntries.receptionId, id) }),
  ]);

  // Case « BL / Facture manquant » : cochée si la fiche a déjà son anomalie BL manquant
  const missingBlAnomaly = !!(await db.query.anomalies.findFirst({ where: and(eq(schema.anomalies.receptionId, id), eq(schema.anomalies.type, "missing_bl")), columns: { id: true } }));
  const draftLines: DraftLine[] = lines.map((l) => ({
    key: `line-${l.id}`,
    productId: l.productId,
    productName: l.productName,
    unit: l.unit ?? "Kg",
    categoryId: l.categoryId,
    qtyOrdered: str(l.qtyOrdered),
    qtyReceived: str(l.qtyReceived),
    temperature: str(l.temperature),
    dlc: l.dlc ?? "",
    lot: l.lot ?? "",
    unitPrice: str(l.unitPrice),
    mercurialPrice: num(l.mercurialPrice),
    mercurialMin: num(l.mercurialMin),
    priceLocked: l.priceLocked,
    decision: l.decision,
    // Refus / réserve déjà choisis : gardés tels quels quand on corrige la ligne
    decisionManual: l.decision !== "conform",

    reason: (l.reason ?? "") as DraftLine["reason"],
    // Type d'anomalie choisi sur un produit accepté (sans Refus / Retour) : gardé tel quel
    typeManual: l.decision === "conform" && !!l.reason && l.refuseQty == null && !l.refuseUnit && l.returnQty == null && !l.returnUnit,
    doc: l.document ?? undefined,
    note: l.note ?? "",
    priceNotShown: l.priceNotShown,
    refuseOn: l.refuseQty != null || !!l.refuseUnit,
    refuseQty: str(l.refuseQty),
    refuseUnit: l.refuseUnit ?? "",
    returnOn: l.returnQty != null || !!l.returnUnit,
    returnQty: str(l.returnQty),
    returnUnit: l.returnUnit ?? "",
    photos: photos.filter((p) => p.lineId === l.id && p.kind !== "label").map((p) => p.url),
    labelPhotos: photos.filter((p) => p.lineId === l.id && p.kind === "label").map((p) => p.url),
    originReceptionId: l.originReceptionId,
    originRef: l.originRef ?? undefined,
  }));

  const draft: Draft = {
    clientUuid: rec.clientUuid,
    step: 0,
    supplierId: rec.supplierId,
    supplierName: rec.supplierName,
    otherSupplier: false,
    deliveredAt: toLocalInput(rec.deliveredAt),
    blNumber: rec.blNumber ?? "",
    documents: (rec.documents as Draft["documents"]) ?? [{ type: "bl", number: rec.blNumber ?? "" }],
    driverName: rec.driverName ?? "",
    truckTemp: str(rec.truckTemp),
    vehicleClean: rec.vehicleClean,
    blPhotos: photos.filter((p) => p.kind === "bl").map((p) => p.url),
    labelPhotos: photos.filter((p) => p.kind === "label" && !p.lineId).map((p) => p.url),
    v: 2,
    driverLeft: rec.driverLeftUnsigned,
    receiverName: rec.receiverName ?? "",
    receiverSignature: rec.receiverSignatureUrl ?? "",
    blRead: "idle",
    imported: !!rec.importedFrom,
    missingBl: missingBlAnomaly,
    ...(rec.kind === "reprise" ? { kind: "reprise" as const, originReceptionId: rec.originReceptionId, originExtraIds: rec.originExtraIds ?? [], noReturnDoc: rec.noReturnDoc } : {}),
    photoOk: photos.some((p) => p.kind === "bl"),
    noBl: !photos.some((p) => p.kind === "bl"),
    lines: draftLines,
    reservesText: rec.reservesText ?? "",
    reservesEdited: false, // recalculé juste en dessous
    signerName: rec.signerName ?? "",
    signature: rec.signatureUrl ?? "",
    bakery: bakery
      ? { baguette: str(bakery.baguette), hamburger: str(bakery.hamburger), rolls: str(bakery.rolls), painDeMie: str(bakery.painDeMie) }
      : undefined,
    updatedAt: new Date().toISOString(),
  };

  // Le texte des réserves reste « modifié à la main » seulement s'il diffère du texte automatique ;
  // sinon il se met à jour avec les corrections.
  const t = dictFor(locale === "en" ? "en" : "fr");
  const auto = buildReservesText(draft, t, { suppliers: [], products: [], categories, fetchedAt: "" });
  draft.reservesEdited = (rec.reservesText ?? "").trim() !== auto.trim();

  return draft;
}
