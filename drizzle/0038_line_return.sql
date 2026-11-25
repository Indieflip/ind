ALTER TABLE "reception_lines" ADD COLUMN "return_kind" text;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD COLUMN "return_product" text;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD COLUMN "return_qty" numeric(12, 3);