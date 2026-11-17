import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  date,
  pgEnum,
  uniqueIndex,
  index,
  real,
  jsonb,
} from "drizzle-orm/pg-core";

/** Profils (onglet « Droits utilisateurs » du fichier) */
export const roleEnum = pgEnum("role", ["admin", "econome", "comptable", "invite"]);
export const decisionEnum = pgEnum("decision", ["conform", "reserve", "refuse"]);
export const receptionStatusEnum = pgEnum("reception_status", ["conform", "with_reserves", "partial_refusal", "refused"]);
export const priceChangeTypeEnum = pgEnum("price_change_type", ["increase", "decrease", "new_product"]);
export const priceSourceEnum = pgEnum("price_source", ["reception", "invoice", "manual", "import", "mercurial"]);
export const anomalyTypeEnum = pgEnum("anomaly_type", [
  "missing",
  "damaged",
  "temperature",
  "dlc",
  "wrong_product",
  "quantity",
  "price",
  "hygiene",
  "missing_bl",
  "locked_price",
  "other",
]);
export const anomalyStatusEnum = pgEnum("anomaly_status", ["open", "claimed", "credit_received", "closed"]);
export const photoKindEnum = pgEnum("photo_kind", ["bl", "issue", "signature"]);

/** Paramètres clé/valeur (secret de session, nom du restaurant…) */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("econome"),
    locale: text("locale").notNull().default("fr"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Unités utilisables dans le mercurial et les bons (pièce, kg, litre, sachet…) */
export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(100),
});

/** Catégories de produits + seuils de température (°C) */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  nameFr: text("name_fr").notNull(),
  nameEn: text("name_en").notNull(),
  tempRequired: boolean("temp_required").notNull().default(false),
  /** Température maxi « conforme » (ex. 4 pour viandes, -18 pour surgelés) */
  conformMax: real("conform_max"),
  /** Température maxi « réserve » ; au-delà : refus proposé */
  reserveMax: real("reserve_max"),
  /** Conditions de conformité (Réglages > Réglementation > Conformité), une par ligne */
  conformRules: text("conform_rules"),
  reserveRules: text("reserve_rules"),
  refuseRules: text("refuse_rules"),
  position: integer("position").notNull().default(0),
});

export interface SupplierContact { email?: string; phone?: string; notes?: string; extra?: { label: string; value: string }[] }
export type SupplierContacts = Partial<Record<"societe" | "reclamation" | "commande", SupplierContact>>;

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    /** Coordonnées par usage : société, réclamation, commande (mail, téléphone, contact / notes) */
    contacts: jsonb("contacts").$type<SupplierContacts>(),
    /** Process de réclamation propre au fournisseur (repris du protocole, modifiable dans son compte) */
    claimProcess: text("claim_process"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suppliers_name_idx").on(t.name)],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    name: text("name").notNull(),
    unit: text("unit").notNull().default("kg"),
    categoryId: integer("category_id").references(() => categories.id),
    /** Colonnes du fichier Mercurial : Service (Cuisine, Bar…) et Nature (Viande, Epicerie…) */
    service: text("service"),
    nature: text("nature"),
    /** Colonne « - » du fichier */
    priceMin: numeric("price_min", { precision: 12, scale: 4 }),
    /** Prix maximum (colonne « + » du fichier). Le prix d'un BL compris entre min et max n'est pas un écart. */
    price: numeric("price", { precision: 12, scale: 4 }),
    /** Prix bloqué : un prix différent sur un BL crée une anomalie, pas une variation de prix */
    priceLocked: boolean("price_locked").notNull().default(false),
    /** Produit issu de l'onglet Fruits et légumes (prix du mois en cours) */
    fvItemId: integer("fv_item_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_supplier_idx").on(t.supplierId)],
);

export const receptions = pgTable(
  "receptions",
  {
    id: serial("id").primaryKey(),
    /** Identifiant généré sur le téléphone : évite les doublons en cas de renvoi hors-ligne */
    clientUuid: text("client_uuid").notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull(),
    blNumber: text("bl_number"),
    driverName: text("driver_name"),
    truckTemp: real("truck_temp"),
    vehicleClean: boolean("vehicle_clean"),
    status: receptionStatusEnum("status").notNull().default("conform"),
    reservesText: text("reserves_text"),
    signerName: text("signer_name"),
    signatureUrl: text("signature_url"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    /** Documents de la livraison : [{ type: "bl" | "facture" | "autre", number }] */
    documents: jsonb("documents").$type<{ type: string; number: string; date?: string | null }[]>(),
    /** Consolidation = validation : le bon ne peut plus être modifié ni supprimé */
    consolidatedAt: timestamp("consolidated_at", { withTimezone: true }),
    consolidatedBy: integer("consolidated_by").references(() => users.id),
  },
  (t) => [uniqueIndex("receptions_client_uuid_idx").on(t.clientUuid), index("receptions_delivered_idx").on(t.deliveredAt)],
);

export const receptionLines = pgTable(
  "reception_lines",
  {
    id: serial("id").primaryKey(),
    receptionId: integer("reception_id")
      .notNull()
      .references(() => receptions.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id),
    productName: text("product_name").notNull(),
    unit: text("unit"),
    categoryId: integer("category_id").references(() => categories.id),
    qtyOrdered: numeric("qty_ordered", { precision: 12, scale: 3 }),
    qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }),
    temperature: real("temperature"),
    dlc: date("dlc"),
    lot: text("lot"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }),
    /** Tranche de prix de référence au moment du bon (min – max) */
    mercurialMin: numeric("mercurial_min", { precision: 12, scale: 4 }),
    mercurialPrice: numeric("mercurial_price", { precision: 12, scale: 4 }),
    priceLocked: boolean("price_locked").notNull().default(false),
    decision: decisionEnum("decision").notNull().default("conform"),
    reason: text("reason"),
    /** Numéro du BL / de la facture auquel la ligne appartient (bons à plusieurs documents) */
    document: text("document"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("lines_reception_idx").on(t.receptionId), index("lines_product_idx").on(t.productId)],
);

export const receptionPhotos = pgTable(
  "reception_photos",
  {
    id: serial("id").primaryKey(),
    receptionId: integer("reception_id")
      .notNull()
      .references(() => receptions.id, { onDelete: "cascade" }),
    lineId: integer("line_id").references(() => receptionLines.id, { onDelete: "cascade" }),
    kind: photoKindEnum("kind").notNull().default("bl"),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("photos_reception_idx").on(t.receptionId)],
);

export const priceChanges = pgTable(
  "price_changes",
  {
    id: serial("id").primaryKey(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    productId: integer("product_id").references(() => products.id),
    productName: text("product_name").notNull(),
    unit: text("unit"),
    oldPrice: numeric("old_price", { precision: 12, scale: 4 }),
    newPrice: numeric("new_price", { precision: 12, scale: 4 }).notNull(),
    pct: real("pct"),
    type: priceChangeTypeEnum("type").notNull(),
    source: priceSourceEnum("source").notNull().default("reception"),
    receptionId: integer("reception_id").references(() => receptions.id, { onDelete: "set null" }),
    invoiceRef: text("invoice_ref"),
    claim: text("claim"),
    createdBy: integer("created_by").references(() => users.id),
    /** Ligne de l'historique des modifications du Mercurial qui a généré cette variation */
    majId: integer("maj_id").references(() => majLog.id, { onDelete: "cascade" }),
  },
  (t) => [index("price_changes_date_idx").on(t.date), uniqueIndex("price_changes_maj_idx").on(t.majId)],
);

export const anomalies = pgTable(
  "anomalies",
  {
    id: serial("id").primaryKey(),
    receptionId: integer("reception_id").references(() => receptions.id, { onDelete: "set null" }),
    lineId: integer("line_id").references(() => receptionLines.id, { onDelete: "set null" }),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    productName: text("product_name"),
    type: anomalyTypeEnum("type").notNull().default("other"),
    description: text("description").notNull(),
    status: anomalyStatusEnum("status").notNull().default("open"),
    creditAmount: numeric("credit_amount", { precision: 12, scale: 2 }),
    followUp: text("follow_up"),
    /** Colonnes du fichier « Anomalies » : nature, référence BL / facture, dernière action, résultat */
    nature: text("nature"),
    reference: text("reference"),
    lastActionAt: date("last_action_at"),
    /** Date de relance : l'anomalie apparaît dans « À suivre aujourd'hui » */
    nextActionAt: date("next_action_at"),
    result: text("result"),
    consolidatedAt: timestamp("consolidated_at", { withTimezone: true }),
    consolidatedBy: integer("consolidated_by").references(() => users.id),
    photoUrl: text("photo_url"),
    /** Ligne reprise du fichier « Suivi contrôle » (remplacée à chaque nouvel import) */
    imported: boolean("imported").notNull().default(false),
    /** N° définitif, attribué par ordre à la consolidation (unique) */
    number: integer("number").unique(),
    /**
     * Suivi unique : a_traiter → reclamee (en attente du fournisseur) → a_verifier (sur facture) → cloturee | annulee
     */
    stage: text("stage").notNull().default("a_traiter"),
    /** Résolution d'une anomalie clôturée : avoir | livraison (livraison différée) | sans_suite */
    resolution: text("resolution"),
    /** reclamation (démarche active, relances) | verification (on vérifie seulement l'avoir / la facture) */
    mode: text("mode").notNull().default("reclamation"),
    /** Montant en jeu (réclamé) ; l'avoir obtenu est creditAmount (Économie HT) */
    claimedAmount: numeric("claimed_amount", { precision: 12, scale: 2 }),
    /** reception | manual | file | weigh */
    source: text("source").notNull().default("reception"),
    /** N° de réclamation (1 = la plus ancienne) ; plusieurs anomalies regroupées partagent le même N° */
    claimNo: integer("claim_no"),
    /** Avoir reçu : n° et date de l'avoir (rapprochement avec la compta) */
    creditNumber: text("credit_number"),
    /** Forme de la régularisation : avoir | facture (régularisation sur une facture) */
    creditKind: text("credit_kind"),
    creditDate: date("credit_date"),
    /** Écarts de pesée regroupés par bon : clé du bon (rec:12 ou ref:Fournisseur : Facture 123) */
    groupKey: text("group_key"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("anomalies_status_idx").on(t.status)],
);

/** Historique « Suivi MAJ » (repris du fichier Excel), affiché dans Reporting */
export const majLog = pgTable(
  "maj_log",
  {
    id: serial("id").primaryKey(),
    date: date("date"),
    nature: text("nature"),
    item: text("item"),
    detail: text("detail"),
    reference: text("reference"),
    claim: text("claim"),
    /** Rapprochement avec la liste des fournisseurs et des produits du mercurial */
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("maj_log_date_idx").on(t.date)],
);

/** Onglet Fruits et légumes : prix « Moins » / « Plus » par mois et prix bloqués */
export const fvItems = pgTable("fv_items", {
  id: serial("id").primaryKey(),
  supplier: text("supplier").notNull(),
  product: text("product").notNull(),
  unit: text("unit"),
  year: integer("year").notNull(),
  /** 24 valeurs : [janv. moins, janv. plus, févr. moins, …, déc. plus] */
  prices: jsonb("prices").$type<(number | null)[]>().notNull().default([]),
  blocked: text("blocked"),
  /** Prix bloqué (produits en bleu dans le fichier) */
  locked: boolean("locked").notNull().default(false),
  position: integer("position").notNull().default(0),
});

/** Notes ajoutées à un bon consolidé (informations complémentaires, horodatées) */
export const receptionNotes = pgTable(
  "reception_notes",
  {
    id: serial("id").primaryKey(),
    receptionId: integer("reception_id")
      .notNull()
      .references(() => receptions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_reception_idx").on(t.receptionId)],
);

/** Suivi boulangerie : quantités saisies sur les bons du fournisseur boulangerie */
export const bakeryEntries = pgTable(
  "bakery_entries",
  {
    id: serial("id").primaryKey(),
    receptionId: integer("reception_id").references(() => receptions.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    baguette: numeric("baguette", { precision: 10, scale: 2 }),
    hamburger: numeric("hamburger", { precision: 10, scale: 2 }),
    rolls: numeric("rolls", { precision: 10, scale: 2 }),
    painDeMie: numeric("pain_de_mie", { precision: 10, scale: 2 }),
    remark: text("remark"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bakery_reception_idx").on(t.receptionId), index("bakery_date_idx").on(t.date)],
);

/** Écarts de pesée : quantité facturée vs pesée (onglet « Ecarts pesée » du fichier de contrôle) */
export const weighGaps = pgTable(
  "weigh_gaps",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    nature: text("nature"),
    supplierRef: text("supplier_ref"),
    product: text("product").notNull(),
    qtyInvoiced: numeric("qty_invoiced", { precision: 12, scale: 3 }),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }),
    qtyWeighed: numeric("qty_weighed", { precision: 12, scale: 3 }),
    acceptableLoss: numeric("acceptable_loss", { precision: 12, scale: 3 }),
    gapQty: numeric("gap_qty", { precision: 12, scale: 3 }),
    gapAmount: numeric("gap_amount", { precision: 12, scale: 4 }),
    detail: text("detail"),
    claimDate: date("claim_date"),
    /** Rapprochement avec les listes du mercurial et document du bon (« Facture 123 du 12/11/26 ») */
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    reference: text("reference"),
    receptionId: integer("reception_id").references(() => receptions.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("weigh_gaps_date_idx").on(t.date)],
);

/** Suivi des kg facturés de viande et de poisson (Mercurial > Viande et Poisson) */
export const meatFishEntries = pgTable(
  "meat_fish_entries",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // viande | poisson
    date: date("date").notNull(),
    product: text("product").notNull(),
    unit: text("unit"),
    qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
    /** Ligne de bon d'origine (null = importé du fichier) */
    receptionId: integer("reception_id").references(() => receptions.id, { onDelete: "cascade" }),
    supplierName: text("supplier_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mf_kind_date_idx").on(t.kind, t.date), index("mf_reception_idx").on(t.receptionId)],
);

/** Protocoles (ex. Process pèse), modifiables par l'administrateur */
export const protocols = pgTable("protocols", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  position: integer("position").notNull().default(100),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Brouillons de bons (enregistrés dès l'étape 1, repris plus tard depuis n'importe quel appareil) */
export const receptionDrafts = pgTable("reception_drafts", {
  id: serial("id").primaryKey(),
  clientUuid: text("client_uuid").notNull().unique(),
  supplierName: text("supplier_name"),
  blNumber: text("bl_number"),
  data: jsonb("data").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Historique des imports de fichier */
export const imports = pgTable("imports", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  products: integer("products"),
  suppliers: integer("suppliers"),
  details: jsonb("details"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Historique des sauvegardes (extractions de données) */
export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // manual | auto
  fileName: text("file_name").notNull(),
  size: integer("size"),
  emailedTo: text("emailed_to"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stockage de secours des fichiers quand Vercel Blob n'est pas configuré */
export const files = pgTable("files", {
  id: text("id").primaryKey(),
  contentType: text("content_type").notNull(),
  dataBase64: text("data_base64").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Role = User["role"];
export type Category = typeof categories.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Reception = typeof receptions.$inferSelect;
export type ReceptionLine = typeof receptionLines.$inferSelect;
export type Decision = ReceptionLine["decision"];
export type Anomaly = typeof anomalies.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type FvItem = typeof fvItems.$inferSelect;

/** Liste des contenants (tares en kg), affichée dans le protocole « Process pèse » */
export const containers = pgTable("containers", {
  id: serial("id").primaryKey(),
  supplier: text("supplier"),
  product: text("product"),
  tare: numeric("tare", { precision: 10, scale: 3 }),
  container: text("container"),
  position: integer("position").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Demandes à l'administrateur (ex. « j'ai créé un doublon, il faut le supprimer ») */
export const adminRequests = pgTable("admin_requests", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  message: text("message"),
  url: text("url"),
  /** open | done | refused */
  status: text("status").notNull().default("open"),
  response: text("response"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  handledBy: integer("handled_by").references(() => users.id, { onDelete: "set null" }),
  handledAt: timestamp("handled_at", { withTimezone: true }),
});

/** Réclamations auprès des fournisseurs (Anomalies > Réclamations) */
export const claims = pgTable(
  "claims",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    supplierName: text("supplier_name"),
    reference: text("reference"),
    product: text("product"),
    subject: text("subject").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    credit: numeric("credit", { precision: 12, scale: 2 }),
    notes: text("notes"),
    /** en_cours | cloturee | annulee */
    status: text("status").notNull().default("en_cours"),
    anomalyId: integer("anomaly_id").references(() => anomalies.id, { onDelete: "set null" }),
    weighGapId: integer("weigh_gap_id").references(() => weighGaps.id, { onDelete: "set null" }),
    receptionId: integer("reception_id").references(() => receptions.id, { onDelete: "set null" }),
    /** manual | anomaly | weigh : ligne reprise automatiquement d'une anomalie ou d'un écart de pesée */
    source: text("source").notNull().default("manual"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("claims_status_idx").on(t.status)],
);

/** Clôtures hebdomadaires des anomalies (bilan de la semaine figé) */
export const weeklyClosings = pgTable("weekly_closings", {
  id: serial("id").primaryKey(),
  /** week (semaine) | month (mois) */
  period: text("period").notNull().default("week"),
  /** Début de la période clôturée : lundi de la semaine ou 1er du mois (AAAA-MM-JJ) */
  week: date("week").notNull(),
  closed: integer("closed").notNull().default(0),
  credits: numeric("credits", { precision: 12, scale: 2 }),
  deferred: numeric("deferred", { precision: 12, scale: 2 }),
  pending: numeric("pending", { precision: 12, scale: 2 }),
  details: jsonb("details"),
  closedBy: integer("closed_by").references(() => users.id, { onDelete: "set null" }),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("closings_period_week_idx").on(t.period, t.week)]);

/** Onglet Dev : objectifs du projet, points en attente, idées (modifiables) */
export const devItems = pgTable("dev_items", {
  id: serial("id").primaryKey(),
  /** objective | pending | idea | done */
  kind: text("kind").notNull().default("pending"),
  title: text("title").notNull(),
  detail: text("detail"),
  /** Qui doit agir : moi (utilisateur) | dev */
  owner: text("owner"),
  /** haute | moyenne | basse */
  priority: text("priority"),
  position: integer("position").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Registres HACCP générés (copie figée des lignes, re-téléchargeable en PDF / Excel / CSV) */
export const haccpRegisters = pgTable("haccp_registers", {
  id: serial("id").primaryKey(),
  fromDate: date("from_date"),
  toDate: date("to_date"),
  receptionCount: integer("reception_count").notNull().default(0),
  lineCount: integer("line_count").notNull().default(0),
  /** Format du premier export (pdf | xlsx | csv) */
  format: text("format").notNull().default("pdf"),
  /** En-têtes et lignes du registre au moment de sa création */
  data: jsonb("data").$type<{ header: string[]; rows: (string | number | null)[][] }>().notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
