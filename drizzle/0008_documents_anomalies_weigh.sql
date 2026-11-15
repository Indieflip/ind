CREATE TABLE "weigh_gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"nature" text,
	"supplier_ref" text,
	"product" text NOT NULL,
	"qty_invoiced" numeric(12, 3),
	"unit_price" numeric(12, 4),
	"qty_weighed" numeric(12, 3),
	"acceptable_loss" numeric(12, 3),
	"gap_qty" numeric(12, 3),
	"gap_amount" numeric(12, 4),
	"detail" text,
	"claim_date" date,
	"reception_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "nature" text;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "last_action_at" date;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "next_action_at" date;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "consolidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "consolidated_by" integer;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "documents" jsonb;--> statement-breakpoint
ALTER TABLE "weigh_gaps" ADD CONSTRAINT "weigh_gaps_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weigh_gaps_date_idx" ON "weigh_gaps" USING btree ("date");--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_consolidated_by_users_id_fk" FOREIGN KEY ("consolidated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;