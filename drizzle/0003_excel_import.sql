CREATE TABLE "fv_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier" text NOT NULL,
	"product" text NOT NULL,
	"unit" text,
	"year" integer NOT NULL,
	"prices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocked" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maj_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date,
	"nature" text,
	"item" text,
	"detail" text,
	"reference" text,
	"claim" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "service" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nature" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_min" numeric(12, 4);--> statement-breakpoint
CREATE INDEX "maj_log_date_idx" ON "maj_log" USING btree ("date");