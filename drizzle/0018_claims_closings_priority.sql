ALTER TABLE "weekly_closings" DROP CONSTRAINT "weekly_closings_week_unique";--> statement-breakpoint
ALTER TABLE "anomalies" ADD COLUMN "claim_no" integer;--> statement-breakpoint
ALTER TABLE "dev_items" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "weekly_closings" ADD COLUMN "period" text DEFAULT 'week' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "closings_period_week_idx" ON "weekly_closings" USING btree ("period","week");