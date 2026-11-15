import type { Decision } from "./rules";

export interface CatalogCategory {
  id: number;
  code: string;
  nameFr: string;
  nameEn: string;
  tempRequired: boolean;
  conformMax: number | null;
  reserveMax: number | null;
}
export interface CatalogSupplier { id: number; name: string; drivers: string[] }
export interface CatalogProduct {
  id: number;
  supplierId: number;
  name: string;
  unit: string;
  categoryId: number | null;
  /** Tranche de prix de référence : min / max (mercurial, ou prix du mois pour les fruits et légumes) */
  priceMin: number | null;
  price: number | null;
  locked: boolean;
}
export interface Catalog {
  suppliers: CatalogSupplier[];
  products: CatalogProduct[];
  categories: CatalogCategory[];
  units?: string[];
  /** Nom du fournisseur dont les bons comportent le suivi boulangerie */
  bakerySupplier?: string;
  fetchedAt: string;
}

export const REASONS = [
  "missing",
  "quantity",
  "temperature",
  "dlc",
  "damaged",
  "label",
  "aspect",
  "not_ordered",
  "wrong_product",
  "other",
] as const;
export type Reason = (typeof REASONS)[number];

export interface DraftLine {
  key: string;
  productId: number | null;
  productName: string;
  unit: string;
  categoryId: number | null;
  qtyOrdered: string;
  qtyReceived: string;
  temperature: string;
  dlc: string;
  lot: string;
  unitPrice: string;
  mercurialPrice: number | null;
  mercurialMin?: number | null;
  priceLocked?: boolean;
  /** Choisie par l'utilisateur (jamais cochée automatiquement) ; null = pas encore choisie */
  decision: Decision | null;
  /** Ancien champ, conservé pour les brouillons existants */
  decisionManual?: boolean;
  reason: Reason | "";
  photos: string[]; // data URL ou URL déjà envoyée
  fromBl?: boolean;
}

export type DocType = "bl" | "facture" | "autre";
export interface DocRef { type: DocType; number: string }

export interface Draft {
  clientUuid: string;
  step: number;
  supplierId: number | null;
  supplierName: string;
  otherSupplier: boolean;
  deliveredAt: string; // valeur datetime-local
  blNumber: string;
  /** Documents de la livraison (bon de livraison, facture, autre) ; le premier numéro = blNumber */
  documents?: DocRef[];
  driverName: string;
  truckTemp: string;
  vehicleClean: boolean | null;
  blPhotos: string[];
  /** Étape 1 : qualité de la photo confirmée, ou livraison sans BL */
  photoOk?: boolean;
  noBl?: boolean;
  blRead: "idle" | "running" | "done" | "none" | "unavailable" | "error";
  lines: DraftLine[];
  reservesText: string;
  reservesEdited: boolean;
  signerName: string;
  signature: string; // data URL
  /** Suivi boulangerie (fournisseur boulangerie uniquement) */
  bakery?: { baguette: string; hamburger: string; rolls: string; painDeMie: string };
  updatedAt: string;
}

/** Charge utile envoyée au serveur */
export interface ReceptionPayload {
  clientUuid: string;
  supplierId: number | null;
  supplierName: string;
  deliveredAt: string; // ISO
  blNumber: string | null;
  documents?: DocRef[];
  driverName: string | null;
  truckTemp: number | null;
  vehicleClean: boolean | null;
  reservesText: string | null;
  signerName: string | null;
  signature: string | null;
  blPhotos: string[];
  bakery?: { baguette: number | null; hamburger: number | null; rolls: number | null; painDeMie: number | null } | null;
  lines: {
    productId: number | null;
    productName: string;
    unit: string;
    categoryId: number | null;
    qtyOrdered: number | null;
    qtyReceived: number | null;
    temperature: number | null;
    dlc: string | null;
    lot: string | null;
    unitPrice: number | null;
    decision: Decision;
    reason: string | null;
    photos: string[];
  }[];
}
