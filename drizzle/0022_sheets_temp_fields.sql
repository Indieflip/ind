ALTER TYPE "public"."photo_kind" ADD VALUE 'label';--> statement-breakpoint
CREATE TABLE "dev_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"form" text NOT NULL,
	"section" text,
	"field" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"rule" text,
	"message" text,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_sheet_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_id" integer NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"reception_count" integer DEFAULT 0 NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "reception_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"date" date NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "temp_classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"max_temp" real NOT NULL,
	"reserve_max" real,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "temp_class_id" integer;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "driver_left_unsigned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reception_sheet_versions" ADD CONSTRAINT "reception_sheet_versions_sheet_id_reception_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."reception_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_sheet_versions" ADD CONSTRAINT "reception_sheet_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_sheet_versions" ADD CONSTRAINT "reception_sheet_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_sheets" ADD CONSTRAINT "reception_sheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reception_sheet_versions_idx" ON "reception_sheet_versions" USING btree ("sheet_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "reception_sheets_year_seq_idx" ON "reception_sheets" USING btree ("year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "reception_sheets_date_idx" ON "reception_sheets" USING btree ("date");