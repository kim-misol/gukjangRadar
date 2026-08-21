CREATE TABLE IF NOT EXISTS "entity_stoplist" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_norm" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_stoplist_name_norm_unique" UNIQUE("name_norm")
);
