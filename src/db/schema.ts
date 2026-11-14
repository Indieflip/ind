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
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "contributor", "viewer"]);
export const decisionEnum = pgEnum("decision", ["conform", "reserve", "refuse"]);
export const receptionStatusEnum = pgEnum("reception_status", ["conform", "with_reserves", "partial_refusal", "refused"]);
export const priceChangeTypeEnum = pgEnum("price_change_type", ["increase", "decrease", "new_product"]);
export const priceSourceEnum = pgEnum("price_source", ["reception", "invoice", "manual", "import"]);
export const anomalyTypeEnum = pgEnum("anomaly_type", [
  "missing",
  "damaged",
  "temperature",
  "dlc",
  "wrong_product",
  "quantity",
  "price",
  "hygiene",
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
    role: roleEnum("role").notNull().default("contributor"),
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
  position: integer("position").notNull().default(0),
});

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
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
    /** Prix HT du mercurial */
    price: numeric("price", { precision: 12, scale: 4 }),
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
    mercurialPrice: numeric("mercurial_price", { precision: 12, scale: 4 }),
    decision: decisionEnum("decision").notNull().default("conform"),
    reason: text("reason"),
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
  },
  (t) => [index("price_changes_date_idx").on(t.date)],
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
    photoUrl: text("photo_url"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("anomalies_status_idx").on(t.status)],
);

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
