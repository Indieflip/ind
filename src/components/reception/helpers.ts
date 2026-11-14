import { evaluateLine, type Evaluation } from "@/lib/rules";
import { checkPrice } from "@/lib/pricing";
import { num } from "@/lib/format";
import type { Catalog, CatalogProduct, Draft, DraftLine, ReceptionPayload } from "@/lib/reception-types";
import type { Dict } from "@/lib/i18n";

export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowLocalInput() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function newDraft(): Draft {
  return {
    clientUuid: uuid(),
    step: 0,
    supplierId: null,
    supplierName: "",
    otherSupplier: false,
    deliveredAt: nowLocalInput(),
    blNumber: "",
    driverName: "",
    truckTemp: "",
    vehicleClean: null,
    blPhotos: [],
    blRead: "idle",
    lines: [],
    reservesText: "",
    reservesEdited: false,
    signerName: "",
    signature: "",
    updatedAt: new Date().toISOString(),
  };
}

export function lineFromProduct(p: CatalogProduct | null, extra: Partial<DraftLine> = {}): DraftLine {
  return {
    key: uuid(),
    productId: p?.id ?? null,
    productName: p?.name ?? "",
    unit: p?.unit ?? "Kg",
    categoryId: p?.categoryId ?? null,
    qtyOrdered: "",
    qtyReceived: "",
    temperature: "",
    dlc: "",
    lot: "",
    unitPrice: "",
    mercurialPrice: p?.price ?? null,
    mercurialMin: p?.priceMin ?? null,
    priceLocked: p?.locked ?? false,
    decision: "conform",
    decisionManual: false,
    reason: "",
    photos: [],
    ...extra,
  };
}

export function evaluate(line: DraftLine, catalog: Catalog | undefined): Evaluation {
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  return evaluateLine(
    {
      qtyOrdered: num(line.qtyOrdered),
      qtyReceived: num(line.qtyReceived),
      temperature: num(line.temperature),
      dlc: line.dlc || null,
      categoryId: line.categoryId,
    },
    cat,
  );
}

/** Recalcule la décision proposée si elle n'a pas été forcée à la main */
export function withAutoDecision(line: DraftLine, catalog: Catalog | undefined): DraftLine {
  if (line.decisionManual) return line;
  const ev = evaluate(line, catalog);
  let reason = line.reason;
  if (ev.decision !== "conform" && !reason) {
    if (ev.issues.includes("temp_over") || ev.issues.includes("temp_limit")) reason = "temperature";
    else if (ev.issues.includes("dlc_expired") || ev.issues.includes("dlc_short")) reason = "dlc";
    else if (ev.issues.includes("qty_less") && num(line.qtyReceived) === 0) reason = "missing";
    else if (ev.issues.includes("qty_less") || ev.issues.includes("qty_more")) reason = "quantity";
  }
  if (ev.decision === "conform" && !line.decisionManual) reason = "";
  return { ...line, decision: ev.decision, reason };
}

/** Comparaison du prix saisi avec la tranche min – max (ou le prix bloqué) */
export function priceCheck(line: DraftLine) {
  return checkPrice(num(line.unitPrice), { min: line.mercurialMin ?? null, max: line.mercurialPrice, locked: !!line.priceLocked });
}

/** Écart en % seulement si le prix sort de la tranche */
export function priceGap(line: DraftLine) {
  const c = priceCheck(line);
  return c.kind === "increase" || c.kind === "decrease" || c.kind === "locked" ? c.pct : null;
}

export function needsTemp(line: DraftLine, catalog: Catalog | undefined) {
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  return !!cat?.tempRequired && num(line.temperature) == null && line.decision !== "refuse";
}

/** Texte des réserves à recopier sur le BL */
export function buildReservesText(d: Draft, t: Dict, catalog: Catalog | undefined): string {
  const parts: string[] = [];
  for (const l of d.lines) {
    if (l.decision === "conform") continue;
    const ev = evaluate(l, catalog);
    const bits: string[] = [];
    if (l.reason) bits.push((t.reasons as Record<string, string>)[l.reason] ?? l.reason);
    const qo = num(l.qtyOrdered);
    const qr = num(l.qtyReceived);
    if (qo != null && qr != null && qo !== qr) bits.push(`${t.wizard.received.toLowerCase()} ${qr} / ${qo} ${l.unit}`);
    const temp = num(l.temperature);
    if (temp != null && (ev.issues.includes("temp_over") || ev.issues.includes("temp_limit"))) bits.push(`${temp} °C`);
    if (l.dlc && (ev.issues.includes("dlc_expired") || ev.issues.includes("dlc_short"))) bits.push(`DLC ${l.dlc.split("-").reverse().join("/")}`);
    parts.push(`${l.decision === "refuse" ? t.decision.refuse.toUpperCase() : t.decision.reserve.toUpperCase()} – ${l.productName} : ${[...new Set(bits)].join(", ")}`);
  }
  const truck = num(d.truckTemp);
  if (d.vehicleClean === false) parts.push(`${t.wizard.vehicleClean} ${t.common.no}`);
  if (truck != null && truck > 4) parts.push(`${t.wizard.truckTemp} : ${truck} °C`);
  return parts.join("\n");
}

export function toPayload(d: Draft): ReceptionPayload {
  return {
    clientUuid: d.clientUuid,
    supplierId: d.otherSupplier ? null : d.supplierId,
    supplierName: d.supplierName.trim(),
    deliveredAt: new Date(d.deliveredAt).toISOString(),
    blNumber: d.blNumber.trim() || null,
    driverName: d.driverName.trim() || null,
    truckTemp: num(d.truckTemp),
    vehicleClean: d.vehicleClean,
    reservesText: d.reservesText.trim() || null,
    signerName: (d.signerName || d.driverName).trim() || null,
    signature: d.signature || null,
    blPhotos: d.blPhotos,
    bakery: d.bakery
      ? { baguette: num(d.bakery.baguette), hamburger: num(d.bakery.hamburger), rolls: num(d.bakery.rolls), painDeMie: num(d.bakery.painDeMie) }
      : null,
    lines: d.lines
      .filter((l) => l.productName.trim())
      .map((l) => ({
        productId: l.productId,
        productName: l.productName.trim(),
        unit: l.unit || "Kg",
        categoryId: l.categoryId,
        qtyOrdered: num(l.qtyOrdered),
        qtyReceived: num(l.qtyReceived),
        temperature: num(l.temperature),
        dlc: l.dlc || null,
        lot: l.lot.trim() || null,
        unitPrice: num(l.unitPrice),
        decision: l.decision,
        reason: l.reason || null,
        photos: l.photos,
      })),
  };
}

export { normalize, matches } from "@/lib/search";
import { normalize as norm } from "@/lib/search";

/** Le bon est-il celui du fournisseur boulangerie (suivi Baguette / Hamburger / Roll's / Pain de mie) ? */
export function isBakerySupplier(name: string, bakerySupplier = "BOULANGERIE THIERRY") {
  const n = norm(name);
  return !!n && n === norm(bakerySupplier);
}
