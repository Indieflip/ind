ALTER TYPE "public"."anomaly_type" ADD VALUE 'missing_bl' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "bakery_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_id" integer,
	"date" date NOT NULL,
	"baguette" numeric(10, 2),
	"hamburger" numeric(10, 2),
	"rolls" numeric(10, 2),
	"pain_de_mie" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocols" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 100 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"reception_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "consolidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "consolidated_by" integer;--> statement-breakpoint
ALTER TABLE "bakery_entries" ADD CONSTRAINT "bakery_entries_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_notes" ADD CONSTRAINT "reception_notes_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_notes" ADD CONSTRAINT "reception_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bakery_reception_idx" ON "bakery_entries" USING btree ("reception_id");--> statement-breakpoint
CREATE INDEX "bakery_date_idx" ON "bakery_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "notes_reception_idx" ON "reception_notes" USING btree ("reception_id");--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_consolidated_by_users_id_fk" FOREIGN KEY ("consolidated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;