ALTER TYPE "public"."price_source" ADD VALUE 'mercurial';--> statement-breakpoint
CREATE TABLE "haccp_registers" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_date" date,
	"to_date" date,
	"reception_count" integer DEFAULT 0 NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL,
	"format" text DEFAULT 'pdf' NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_changes" ADD COLUMN "maj_id" integer;--> statement-breakpoint
ALTER TABLE "haccp_registers" ADD CONSTRAINT "haccp_registers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_maj_id_maj_log_id_fk" FOREIGN KEY ("maj_id") REFERENCES "public"."maj_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_changes_maj_idx" ON "price_changes" USING btree ("maj_id");