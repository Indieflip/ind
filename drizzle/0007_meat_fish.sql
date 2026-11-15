CREATE TABLE "meat_fish_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"product" text NOT NULL,
	"unit" text,
	"qty" numeric(12, 3) NOT NULL,
	"reception_id" integer,
	"supplier_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meat_fish_entries" ADD CONSTRAINT "meat_fish_entries_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mf_kind_date_idx" ON "meat_fish_entries" USING btree ("kind","date");--> statement-breakpoint
CREATE INDEX "mf_reception_idx" ON "meat_fish_entries" USING btree ("reception_id");