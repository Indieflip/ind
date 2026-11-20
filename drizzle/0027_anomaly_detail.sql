ALTER TABLE "anomalies" ADD COLUMN "problem_type" text;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;