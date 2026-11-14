ALTER TABLE "reception_lines" ADD COLUMN "mercurial_min" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "reception_lines" ADD COLUMN "price_locked" boolean DEFAULT false NOT NULL;