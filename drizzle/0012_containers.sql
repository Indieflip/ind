CREATE TABLE "containers" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier" text,
	"product" text,
	"tare" numeric(10, 3),
	"container" text,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
