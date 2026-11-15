CREATE TABLE "admin_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"message" text,
	"url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"response" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_by" integer,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"supplier_id" integer,
	"supplier_name" text,
	"reference" text,
	"product" text,
	"subject" text NOT NULL,
	"amount" numeric(12, 2),
	"credit" numeric(12, 2),
	"notes" text,
	"status" text DEFAULT 'en_cours' NOT NULL,
	"anomaly_id" integer,
	"weigh_gap_id" integer,
	"reception_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_requests" ADD CONSTRAINT "admin_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_requests" ADD CONSTRAINT "admin_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_anomaly_id_anomalies_id_fk" FOREIGN KEY ("anomaly_id") REFERENCES "public"."anomalies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_weigh_gap_id_weigh_gaps_id_fk" FOREIGN KEY ("weigh_gap_id") REFERENCES "public"."weigh_gaps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_status_idx" ON "claims" USING btree ("status");