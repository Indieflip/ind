CREATE TABLE "weekly_closings" (
	"id" serial PRIMARY KEY NOT NULL,
	"week" date NOT NULL,
	"closed" integer DEFAULT 0 NOT NULL,
	"credits" numeric(12, 2),
	"deferred" numeric(12, 2),
	"pending" numeric(12, 2),
	"details" jsonb,
	"closed_by" integer,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_closings_week_unique" UNIQUE("week")
);
--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "stage" text DEFAULT 'a_traiter' NOT NULL;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "mode" text DEFAULT 'reclamation' NOT NULL;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "claimed_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "source" text DEFAULT 'reception' NOT NULL;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "weekly_closings" ADD CONSTRAINT "weekly_closings_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;