import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import { buildReservesText } from "@/components/reception/helpers";
import { Wizard } from "@/components/reception/Wizard";
import type { Draft, DraftLine } from "@/lib/reception-types";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (v == null ? "" : String(num(v) ?? v));

/** Date au format du champ datetime-local, heure de Paris */
function toLocalInput(d: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(d)
    .replace(" ", "T");
}

export default async function EditReceptionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(can.editReception);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id) });
  if (!rec) notFound();
  if (rec.consolidatedAt) redirect(`/receptions/${id}`);
  const [lines, photos, categories, bakery] = await Promise.all([
    db.select().from(schema.receptionLines).where(eq(schema.receptionLines.receptionId, id)).orderBy(asc(schema.receptionLines.position)),
    db.select().from(schema.receptionPhotos).where(eq(schema.receptionPhotos.receptionId, id)),
    db.select().from(schema.categories),
    db.query.bakeryEntries.findFirst({ where: eq(schema.bakeryEntries.receptionId, id) }),
  ]);

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

    reason: (l.reason ?? "") as DraftLine["reason"],
    photos: photos.filter((p) => p.lineId === l.id).map((p) => p.url),
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
    blRead: "idle",
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
  const { t } = await getDict();
  const auto = buildReservesText(draft, t, { suppliers: [], products: [], categories, fetchedAt: "" });
  draft.reservesEdited = (rec.reservesText ?? "").trim() !== auto.trim();

  return (
    <Suspense>
      <Wizard blReadingEnabled={!!process.env.ANTHROPIC_API_KEY} editId={id} initialDraft={draft} />
    </Suspense>
  );
}
