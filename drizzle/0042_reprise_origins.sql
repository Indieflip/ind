ALTER TABLE "receptions" ADD COLUMN "origin_extra_ids" jsonb;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "no_return_doc" boolean DEFAULT false NOT NULL;