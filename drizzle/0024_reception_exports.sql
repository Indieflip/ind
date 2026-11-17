CREATE TABLE "reception_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"mode" text DEFAULT 'auto' NOT NULL,
	"day" date,
	"reception_ids" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"reception_count" integer DEFAULT 0 NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reception_exports" ADD CONSTRAINT "reception_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reception_exports_year_seq_idx" ON "reception_exports" USING btree ("year","seq");--> statement-breakpoint
CREATE INDEX "reception_exports_day_idx" ON "reception_exports" USING btree ("day");