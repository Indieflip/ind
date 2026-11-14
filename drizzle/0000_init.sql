CREATE TYPE "public"."anomaly_status" AS ENUM('open', 'claimed', 'credit_received', 'closed');--> statement-breakpoint
CREATE TYPE "public"."anomaly_type" AS ENUM('missing', 'damaged', 'temperature', 'dlc', 'wrong_product', 'quantity', 'price', 'hygiene', 'other');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('conform', 'reserve', 'refuse');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('bl', 'issue', 'signature');--> statement-breakpoint
CREATE TYPE "public"."price_change_type" AS ENUM('increase', 'decrease', 'new_product');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('reception', 'invoice', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."reception_status" AS ENUM('conform', 'with_reserves', 'partial_refusal', 'refused');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'contributor', 'viewer');--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_id" integer,
	"line_id" integer,
	"supplier_id" integer,
	"supplier_name" text NOT NULL,
	"product_name" text,
	"type" "anomaly_type" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"status" "anomaly_status" DEFAULT 'open' NOT NULL,
	"credit_amount" numeric(12, 2),
	"follow_up" text,
	"photo_url" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_fr" text NOT NULL,
	"name_en" text NOT NULL,
	"temp_required" boolean DEFAULT false NOT NULL,
	"conform_max" real,
	"reserve_max" real,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"supplier_id" integer,
	"supplier_name" text NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"unit" text,
	"old_price" numeric(12, 4),
	"new_price" numeric(12, 4) NOT NULL,
	"pct" real,
	"type" "price_change_type" NOT NULL,
	"source" "price_source" DEFAULT 'reception' NOT NULL,
	"reception_id" integer,
	"invoice_ref" text,
	"claim" text,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL,
	"category_id" integer,
	"price" numeric(12, 4),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"unit" text,
	"category_id" integer,
	"qty_ordered" numeric(12, 3),
	"qty_received" numeric(12, 3),
	"temperature" real,
	"dlc" date,
	"lot" text,
	"unit_price" numeric(12, 4),
	"mercurial_price" numeric(12, 4),
	"decision" "decision" DEFAULT 'conform' NOT NULL,
	"reason" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_id" integer NOT NULL,
	"line_id" integer,
	"kind" "photo_kind" DEFAULT 'bl' NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_uuid" text NOT NULL,
	"supplier_id" integer,
	"supplier_name" text NOT NULL,
	"delivered_at" timestamp with time zone NOT NULL,
	"bl_number" text,
	"driver_name" text,
	"truck_temp" real,
	"vehicle_clean" boolean,
	"status" "reception_status" DEFAULT 'conform' NOT NULL,
	"reserves_text" text,
	"signer_name" text,
	"signature_url" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'contributor' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_line_id_reception_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."reception_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_photos" ADD CONSTRAINT "reception_photos_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_photos" ADD CONSTRAINT "reception_photos_line_id_reception_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."reception_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anomalies_status_idx" ON "anomalies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "price_changes_date_idx" ON "price_changes" USING btree ("date");--> statement-breakpoint
CREATE INDEX "products_supplier_idx" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "lines_reception_idx" ON "reception_lines" USING btree ("reception_id");--> statement-breakpoint
CREATE INDEX "lines_product_idx" ON "reception_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "photos_reception_idx" ON "reception_photos" USING btree ("reception_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receptions_client_uuid_idx" ON "receptions" USING btree ("client_uuid");--> statement-breakpoint
CREATE INDEX "receptions_delivered_idx" ON "receptions" USING btree ("delivered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");