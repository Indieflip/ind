ALTER TABLE "anomalies" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "weigh_gaps" ADD COLUMN "supplier_id" integer;--> statement-breakpoint
ALTER TABLE "weigh_gaps" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "weigh_gaps" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "weigh_gaps" ADD CONSTRAINT "weigh_gaps_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weigh_gaps" ADD CONSTRAINT "weigh_gaps_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_number_unique" UNIQUE("number");