ALTER TABLE "receptions" ADD COLUMN "kind" text DEFAULT 'livraison' NOT NULL;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "origin_reception_id" integer;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_origin_reception_id_receptions_id_fk" FOREIGN KEY ("origin_reception_id") REFERENCES "public"."receptions"("id") ON DELETE set null ON UPDATE no action;