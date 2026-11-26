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
  /** Motifs de refus / retour ajoutés par les utilisateurs (en plus de la liste de base) */
  reasons?: string[];
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
  /** Prix non indiqué sur le bon (soit un prix, soit cette case) */
  priceNotShown?: boolean;
  mercurialPrice: number | null;
  mercurialMin?: number | null;
  priceLocked?: boolean;
  /** Choisie par l'utilisateur (jamais cochée automatiquement) ; null = pas encore choisie */
  decision: Decision | null;
  /** Ancien champ, conservé pour les brouillons existants */
  decisionManual?: boolean;
  /** Motif de la liste de base, ou motif ajouté (texte) */
  reason: Reason | "" | (string & {});
  photos: string[]; // data URL ou URL déjà envoyée
  fromBl?: boolean;
  /** Numéro du document (BL / facture) auquel le produit est rattaché */
  doc?: string;
  /** Note libre sur le produit */
  note?: string;
  /** Boutons « Refus » et « Retour » (indépendants) : quantité et unité de chacun */
  /** Bouton « Refus » activé (au-dessus de la conformité, indépendant de la décision) */
  refuseOn?: boolean;
  refuseQty?: string;
  refuseUnit?: string;
  /** Bouton « Retour » activé */
  returnOn?: boolean;
  returnQty?: string;
  returnUnit?: string;
}

export type DocType = "bl" | "facture" | "autre";
export interface DocRef { type: DocType; number: string; /** Date figurant sur le document (AAAA-MM-JJ) */ date?: string }

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
  /** Étape 1 : photos de l'étiquette (lot / DLC) */
  labelPhotos?: string[];
  /** Étape 1 : le livreur est parti sans signer */
  driverLeft?: boolean;
  /** Étape 1 : nom, prénom et signature de la personne qui réceptionne (obligatoires) */
  receiverName?: string;
  receiverSignature?: string;
  /** Étape 1 : qualité de la photo confirmée, ou livraison sans BL */
  photoOk?: boolean;
  noBl?: boolean;
  /** Case « BL / Facture manquant » (anomalie BL manquant) */
  missingBl?: boolean;
  /** Fiche générée depuis les anomalies importées : aucun champ obligatoire */
  imported?: boolean;
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
  driverLeftUnsigned?: boolean;
  receiverName?: string | null;
  receiverSignature?: string | null;
  blPhotos: string[];
  labelPhotos?: string[];
  bakery?: { baguette: number | null; hamburger: number | null; rolls: number | null; painDeMie: number | null } | null;
  missingBl?: boolean;
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
    priceNotShown?: boolean;
    decision: Decision;
    reason: string | null;
    photos: string[];
    document?: string | null;
    note?: string | null;
    /** Modification : id de la ligne d'origine (pour reporter les changements sur les fiches d'anomalie) */
    refuseQty?: number | null;
    refuseUnit?: string | null;
    returnQty?: number | null;
    returnUnit?: string | null;
    ref?: number | null;
  }[];
}
