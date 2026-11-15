ALTER TABLE "maj_log" ADD COLUMN "supplier_id" integer;--> statement-breakpoint
ALTER TABLE "maj_log" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "maj_log" ADD CONSTRAINT "maj_log_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maj_log" ADD CONSTRAINT "maj_log_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;