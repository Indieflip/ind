CREATE TABLE "dev_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"owner" text,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "credit_number" text;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "credit_date" date;