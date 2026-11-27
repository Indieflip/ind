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

export function newDraft(kind: "livraison" | "reprise" = "livraison", originReceptionId: number | null = null): Draft {
  return {
    ...(kind === "reprise" ? { kind, originReceptionId } : {}),
    v: 2,
    clientUuid: uuid(),
    step: 0,
    supplierId: null,
    supplierName: "",
    otherSupplier: false,
    deliveredAt: nowLocalInput(),
    blNumber: "",
    documents: [{ type: kind === "reprise" ? "reprise" : "bl", number: "" }],
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
  if (line.decisionManual || !line.productName.trim()) return line;
  const ev = evaluate(line, catalog, truckTemp);
  const missing = ev.issues.includes("temp_missing") || (dlcRequired(line, catalog) && !line.dlc);
  const decision = ev.decision === "refuse" ? "refuse" : missing ? null : "conform";
  // Motif gardé tant qu'un Refus / Retour (quantité) est saisi, même si le produit reste « Acceptée »
  const reason = decision === "refuse" ? line.reason || suggestedReason(line, catalog, truckTemp) : line.refuseOn || line.returnOn || line.typeManual ? line.reason : "";
  return decision === line.decision && reason === line.reason ? line : { ...line, decision, reason };
}


/** Comparaison du prix saisi avec la tranche min – max (ou le prix bloqué) */
/**
 * Type d'anomalie pré-calculé par le système pour un produit accepté avec un écart détecté (comme sur la fiche d'anomalie créée) :
 * T° → Température, DLC dépassée → DLC, quantité → Quantité produit (au kg, poids en trop → Écart de pesée) ; null si rien à signaler.
 */
export function detectedType(line: DraftLine, catalog: Catalog | undefined, labels: { temperature: string; dlc: string; missing: string }, weighType: string) {
  const kg = (line.unit || "").toLowerCase() === "kg";
  const issues = evaluate(line, catalog).issues.filter((i) => i !== "temp_missing" && i !== "temp_limit" && i !== "dlc_short" && !(kg && i === "qty_less"));
  const first = issues[0];
  if (!first) return null;
  return first.startsWith("temp") || first === "truck_over" ? labels.temperature : first.startsWith("dlc") ? labels.dlc : kg && first === "qty_more" ? weighType : labels.missing;
}

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

/** Produits dont la nature demande la photo d'étiquette (lot / DLC) et qui n'en ont pas encore */
export function linesMissingLabel(lines: DraftLine[], catalog: Catalog | undefined) {
  return lines.filter((l) => l.productName.trim() && l.decision !== "refuse" && dlcRequired(l, catalog) && !(l.labelPhotos ?? []).length);
}

/** Anciens brouillons (4 étapes : photos / livraison / contrôle / validation) → 3 étapes (livraison / contrôle / validation) */
export function upgradeDraft(d: Draft): Draft {
  return d.v === 2 ? d : { ...d, v: 2, step: Math.max(0, (d.step ?? 0) - 1) };
}

export function needsTemp(line: DraftLine, catalog: Catalog | undefined) {
  const cat = catalog?.categories.find((c) => c.id === line.categoryId);
  return !!cat?.tempRequired && num(line.temperature) == null && line.decision !== "refuse";
}

/** Texte des réserves à recopier sur le BL */
export function buildReservesText(d: Draft, t: Dict, catalog: Catalog | undefined): string {
  const parts: string[] = [];
  // Bon de reprise : la liste des produits repris (quantité, motif)
  if (d.kind === "reprise") {
    for (const l of d.lines) {
      if (!l.productName.trim()) continue;
      const q = num(l.qtyReceived) ?? num(l.qtyOrdered);
      parts.push(`${t.wizard.returnBtn.toUpperCase()} – ${l.productName}${q != null ? ` : ${q} ${l.unit}` : ""}${l.reason ? ` (${(t.reasons as Record<string, string>)[l.reason] ?? l.reason})` : ""}`);
    }
    return parts.join("\n");
  }
  for (const l of d.lines) {
    // Refus / Retour (boutons au-dessus de la conformité) : quantité et unité de chacun
    const fq = l.refuseOn ? num(l.refuseQty ?? "") ?? num(l.qtyOrdered) ?? num(l.qtyReceived) : null;
    const rq = l.returnOn ? num(l.returnQty ?? "") ?? num(l.qtyOrdered) ?? num(l.qtyReceived) : null;
    if (fq != null) parts.push(`${t.decision.refuse.toUpperCase()} – ${l.productName} : ${fq} ${l.refuseUnit || l.unit}`);
    if (rq != null) parts.push(`${t.wizard.returnBtn.toUpperCase()} – ${l.productName} : ${rq} ${l.returnUnit || l.unit}`);
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
    missingBl: d.kind === "reprise" ? false : !!d.missingBl,
    kind: d.kind === "reprise" ? "reprise" : "livraison",
    originReceptionId: d.kind === "reprise" ? (d.noReturnDoc ? null : d.originReceptionId ?? null) : null,
    // (livraisons d'origine des produits repris comprises)
    originExtraIds: d.kind === "reprise" && !d.noReturnDoc ? [...new Set([...(d.originExtraIds ?? []), ...d.lines.map((l) => l.originReceptionId ?? 0)])].filter((x) => x && x !== d.originReceptionId) : [],
    noReturnDoc: d.kind === "reprise" ? !!d.noReturnDoc : false,
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
        labelPhotos: l.labelPhotos ?? [],
        originReceptionId: d.kind === "reprise" ? l.originReceptionId ?? null : null,
        originRef: d.kind === "reprise" ? l.originRef || null : null,
        document: lineDoc(d, l) || null,
        note: l.note?.trim() || null,
        ref: /^line-\d+$/.test(l.key) ? Number(l.key.slice(5)) : null,
        // Refus / Retour : quantité (Q Facturée par défaut) et unité (celle de la ligne par défaut)
        refuseQty: l.refuseOn ? num(l.refuseQty ?? "") ?? num(l.qtyOrdered) ?? num(l.qtyReceived) : null,
        refuseUnit: l.refuseOn ? l.refuseUnit || l.unit || null : null,
        // (bon de reprise : quantité reprise = Q reprise, sinon Q sur le bon)
        returnQty: d.kind === "reprise" ? num(l.qtyReceived) ?? num(l.qtyOrdered) : l.returnOn ? num(l.returnQty ?? "") ?? num(l.qtyOrdered) ?? num(l.qtyReceived) : null,
        returnUnit: d.kind === "reprise" ? l.unit || null : l.returnOn ? l.returnUnit || l.unit || null : null,
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
