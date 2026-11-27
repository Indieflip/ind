CREATE TABLE "return_slips" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"date" date NOT NULL,
	"reception_id" integer,
	"supplier_id" integer,
	"supplier_name" text NOT NULL,
	"items" jsonb NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "return_slips" ADD CONSTRAINT "return_slips_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_slips" ADD CONSTRAINT "return_slips_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_slips" ADD CONSTRAINT "return_slips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;