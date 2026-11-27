ALTER TABLE "reception_lines" ADD COLUMN "origin_reception_id" integer;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD COLUMN "origin_ref" text;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_origin_reception_id_receptions_id_fk" FOREIGN KEY ("origin_reception_id") REFERENCES "public"."receptions"("id") ON DELETE set null ON UPDATE no action;