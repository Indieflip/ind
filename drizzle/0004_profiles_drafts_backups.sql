ALTER TYPE "public"."anomaly_type" ADD VALUE 'locked_price' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"size" integer,
	"emailed_to" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"products" integer,
	"suppliers" integer,
	"details" jsonb,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_uuid" text NOT NULL,
	"supplier_name" text,
	"bl_number" text,
	"data" jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reception_drafts_client_uuid_unique" UNIQUE("client_uuid")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'econome'::text;--> statement-breakpoint
UPDATE "users" SET "role" = 'econome' WHERE "role" = 'contributor';--> statement-breakpoint
UPDATE "users" SET "role" = 'comptable' WHERE "role" = 'viewer';--> statement-breakpoint
DROP TYPE "public"."role";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'econome', 'comptable', 'invite');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'econome'::"public"."role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."role" USING "role"::"public"."role";--> statement-breakpoint
ALTER TABLE "bakery_entries" ADD COLUMN "remark" text;--> statement-breakpoint
ALTER TABLE "fv_items" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fv_item_id" integer;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_drafts" ADD CONSTRAINT "reception_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "units" SET "name" = upper(left("name", 1)) || substr("name", 2) WHERE "name" <> upper(left("name", 1)) || substr("name", 2) AND NOT EXISTS (SELECT 1 FROM "units" u2 WHERE u2."name" = upper(left("units"."name", 1)) || substr("units"."name", 2));--> statement-breakpoint
UPDATE "products" SET "unit" = upper(left("unit", 1)) || substr("unit", 2) WHERE "unit" <> '';