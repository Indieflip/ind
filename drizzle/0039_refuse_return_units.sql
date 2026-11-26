ALTER TABLE "reception_lines" ADD COLUMN "refuse_qty" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "reception_lines" ADD COLUMN "refuse_unit" text;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD COLUMN "return_unit" text;