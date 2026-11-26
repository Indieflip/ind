import { evaluateLine, type Evaluation } from "@/lib/rules";
import { checkPrice } from "@/lib/pricing";
import { fmtDate, num } from "@/lib/format";
import type { Catalog, CatalogProduct, DocRef, Draft, DraftLine, ReceptionPayload } from "@/lib/reception-types";
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
    documents: [{ type: "bl", number: "" }],
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

/**
 * Recherche de produits : une seule ligne par produit (même nom et même unité chez le fournisseur),
 * avec la fourchette de prix « min - max » de ses lignes au Mercurial.
 */
export function groupProducts(list: CatalogProduct[]): CatalogProduct[] {
  const k = (p: CatalogProduct) => `${p.name.trim().toLowerCase()}|${(p.unit ?? "").trim().toLowerCase()}`;
  const map = new Map<string, CatalogProduct>();
  for (const p of list) {
    const cur = map.get(k(p));
    if (!cur) { map.set(k(p), { ...p }); continue; }
    const prices = [cur.priceMin, cur.price, p.priceMin, p.price].filter((x): x is number => x != null);
    map.set(k(p), { ...cur, priceMin: prices.length ? Math.min(...prices) : null, price: prices.length ? Math.max(...prices) : null, locked: cur.locked || p.locked });
  }
  return [...map.values()];
}

/** Prix affiché dans la recherche : « 3,70 € » ou « 3,70 € - 5,40 € » */
export function priceRange(p: { priceMin?: number | null; price?: number | null }, fmt: (v: number) => string) {
  const lo = p.priceMin ?? p.price;
  const hi = p.price ?? p.priceMin;
  if (lo == null || hi == null) return "";
  return Math.abs(hi - lo) < 0.005 ? fmt(hi) : `${fmt(Math.min(lo, hi))} - ${fmt(Math.max(lo, hi))}`;
}

export function lineFromProduct(p: CatalogProduct | null, extra: Partial<DraftLine> = {}): DraftLine {
  return {
    key: uuid(),
    productId: p?.id ?? null,
    productName: p?.name ?? "",
    // Produit sans unité au mercurial : « Pièce » (jamais « Kg » par défaut, ce qui en ferait un écart de pesée)
    unit: p ? p.unit || "Pièce" : "Kg",
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
    decision: null,
    reason: "",
    photos: [],
    ...extra,
  };
}

/** Documents du bon (anciens brouillons : le numéro de BL seul) */
export function docsOf(d: Draft): DocRef[] {
  return d.documents?.length ? d.documents : [{ type: "bl", number: d.blNumber ?? "" }];
}

/** Numéros des documents saisis */
export function docNumbers(d: Draft) {
  return docsOf(d).map((x) => x.number.trim()).filter(Boolean);
}

/** Document d'une ligne : celui choisi s'il existe encore, sinon le premier */
export function lineDoc(d: Draft, l: DraftLine) {
  const nums = docNumbers(d);
  return l.doc && nums.includes(l.doc.trim()) ? l.doc.trim() : nums[0] ?? "";
}

export function evaluate(line: DraftLine, catalog: Catalog | undefined, truckTemp?: string): Evaluation {
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  return evaluateLine(
    {
      qtyOrdered: num(line.qtyOrdered),
      qtyReceived: num(line.qtyReceived),
      temperature: num(line.temperature),
      dlc: line.dlc || null,
      categoryId: line.categoryId,
      truckTemp: truckTemp != null ? num(truckTemp) : null,
    },
    cat,
  );
}

/** Décision proposée par les règles (affichée, jamais cochée automatiquement) */
export function suggestedDecision(line: DraftLine, catalog: Catalog | undefined) {
  return evaluate(line, catalog).decision;
}

/** Motif proposé pour une réserve ou un refus, d'après les contrôles */
export function suggestedReason(line: DraftLine, catalog: Catalog | undefined, truckTemp?: string): DraftLine["reason"] {
  const ev = evaluate(line, catalog, truckTemp);
  if (ev.issues.includes("temp_over") || ev.issues.includes("truck_over")) return "temperature";
  if (ev.issues.includes("dlc_expired")) return "dlc";
  if (ev.issues.includes("qty_less") && num(line.qtyReceived) === 0) return "missing";
  if (ev.issues.includes("qty_less") || ev.issues.includes("qty_more")) return "quantity";
  return "";
}

/**
 * Conformité produit automatique : Conforme si T° camion, T° produit et DLC sont conformes, Refus sinon.
 * Tant qu'une donnée obligatoire manque (T° produit, DLC), rien n'est coché.
 * Un choix fait à la main (decisionManual) n'est jamais remplacé : l'utilisateur peut refuser un produit conforme.
 */
export function withAutoDecision(line: DraftLine, catalog: Catalog | undefined, truckTemp?: string): DraftLine {
  // Choix fait à la main (Refus / Retour compris) : jamais remplacé par la proposition automatique
  if (line.decisionManual || line.returnOn || !line.productName.trim()) return line;
  const ev = evaluate(line, catalog, truckTemp);
  const missing = ev.issues.includes("temp_missing") || (dlcRequired(line, catalog) && !line.dlc);
  const decision = ev.decision === "refuse" ? "refuse" : missing ? null : "conform";
  const reason = decision === "refuse" ? line.reason || suggestedReason(line, catalog, truckTemp) : "";
  return decision === line.decision && reason === line.reason ? line : { ...line, decision, reason };
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

/** Catégories dont la DLC / DDM est obligatoire : viandes, poissons, surgelés */
export const DLC_REQUIRED = ["meat", "fish", "frozen"];
export function dlcRequired(line: DraftLine, catalog: Catalog | undefined) {
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  return !!cat && DLC_REQUIRED.includes(cat.code);
}
export function needsDlc(line: DraftLine, catalog: Catalog | undefined) {
  return dlcRequired(line, catalog) && !line.dlc && line.decision !== "refuse";
}

/** Photo d'étiquette obligatoire dès qu'un produit à DLC obligatoire (viandes, poissons, surgelés) est accepté */
export function labelPhotoRequired(lines: DraftLine[], catalog: Catalog | undefined) {
  return lines.some((l) => l.productName.trim() && l.decision !== "refuse" && dlcRequired(l, catalog));
}

export function needsTemp(line: DraftLine, catalog: Catalog | undefined) {
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  return !!cat?.tempRequired && num(line.temperature) == null && line.decision !== "refuse";
}

/** Texte des réserves à recopier sur le BL */
export function buildReservesText(d: Draft, t: Dict, catalog: Catalog | undefined): string {
  const parts: string[] = [];
  for (const l of d.lines) {
    if (!l.decision) continue;
    const ev = evaluate(l, catalog);
    if (l.decision === "conform") {
      // Produit accepté avec un écart de quantité : à noter sur le BL
      const qo = num(l.qtyOrdered);
      const qr = num(l.qtyReceived);
      if (qo != null && qr != null && qo !== qr) parts.push(`${(qr < qo ? t.wizard.gapMissing : t.wizard.gapExtra).toUpperCase()} – ${l.productName} : ${t.wizard.received.toLowerCase()} ${qr} / ${qo} ${l.unit}`);
      continue;
    }
    const bits: string[] = [];
    if (l.reason) bits.push((t.reasons as Record<string, string>)[l.reason] ?? l.reason);
    const qo = num(l.qtyOrdered);
    const qr = num(l.qtyReceived);
    if (qo != null && qr != null && qo !== qr) bits.push(`${t.wizard.received.toLowerCase()} ${qr} / ${qo} ${l.unit}`);
    const temp = num(l.temperature);
    if (temp != null && (ev.issues.includes("temp_over") || ev.issues.includes("temp_limit"))) bits.push(`${temp} °C`);
    if (l.dlc && (ev.issues.includes("dlc_expired") || ev.issues.includes("dlc_short"))) bits.push(`DLC ${fmtDate(l.dlc)}`);
    // Refus / Retour : quantité et unité de chacun
    const fq = l.decision === "refuse" ? num(l.refuseQty ?? "") ?? qo ?? qr : null;
    if (fq != null) bits.unshift(`${fq} ${l.refuseUnit || l.unit}`);
    const label = l.decision === "refuse" ? t.decision.refuse : l.returnOn ? t.wizard.returnBtn : t.decision.reserve;
    parts.push(`${label.toUpperCase()} – ${l.productName} : ${[...new Set(bits)].join(", ")}`);
    const rq = l.returnOn ? num(l.returnQty ?? "") ?? qo ?? qr : null;
    if (l.decision === "refuse" && rq != null) parts.push(`${t.wizard.returnBtn.toUpperCase()} – ${l.productName} : ${rq} ${l.returnUnit || l.unit}`);
    else if (rq != null && l.decision !== "refuse") parts[parts.length - 1] += `${bits.length ? ", " : ""}${rq} ${l.returnUnit || l.unit}`;
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
    blNumber: docsOf(d).find((x) => x.number.trim())?.number.trim() || d.blNumber.trim() || null,
    documents: docsOf(d).filter((x) => x.number.trim()).map((x) => ({ type: x.type, number: x.number.trim(), date: x.date || undefined })),
    driverName: d.driverName.trim() || null,
    truckTemp: num(d.truckTemp),
    vehicleClean: d.vehicleClean,
    reservesText: d.reservesText.trim() || null,
    signerName: (d.signerName || d.driverName).trim() || null,
    signature: d.signature || null,
    driverLeftUnsigned: !d.signature && !!d.driverLeft,
    receiverName: d.receiverName?.trim() || null,
    receiverSignature: d.receiverSignature || null,
    blPhotos: d.blPhotos,
    missingBl: !!d.missingBl,
    labelPhotos: d.labelPhotos ?? [],
    bakery: d.bakery
      ? { baguette: num(d.bakery.baguette), hamburger: num(d.bakery.hamburger), rolls: num(d.bakery.rolls), painDeMie: num(d.bakery.painDeMie) }
      : null,
    lines: d.lines
      .filter((l) => l.productName.trim())
      .map((l) => ({
        productId: l.productId,
        productName: l.productName.trim(),
        unit: l.unit || "Pièce",
        categoryId: l.categoryId,
        qtyOrdered: num(l.qtyOrdered),
        qtyReceived: num(l.qtyReceived),
        temperature: num(l.temperature),
        dlc: l.dlc || null,
        lot: l.lot.trim() || null,
        unitPrice: num(l.unitPrice),
        priceNotShown: !!l.priceNotShown,
        decision: l.decision ?? "conform",
        reason: l.reason || null,
        photos: l.photos,
        document: lineDoc(d, l) || null,
        note: l.note?.trim() || null,
        ref: /^line-\d+$/.test(l.key) ? Number(l.key.slice(5)) : null,
        // Refus / Retour : quantité (Q Facturée par défaut) et unité (celle de la ligne par défaut)
        refuseQty: l.decision === "refuse" ? num(l.refuseQty ?? "") ?? num(l.qtyOrdered) ?? num(l.qtyReceived) : null,
        refuseUnit: l.decision === "refuse" ? l.refuseUnit || l.unit || null : null,
        returnQty: l.returnOn && l.decision !== "conform" ? num(l.returnQty ?? "") ?? num(l.qtyOrdered) ?? num(l.qtyReceived) : null,
        returnUnit: l.returnOn && l.decision !== "conform" ? l.returnUnit || l.unit || null : null,
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
