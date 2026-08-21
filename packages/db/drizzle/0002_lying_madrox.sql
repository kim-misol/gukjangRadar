ALTER TABLE "news_source" ADD COLUMN "kind" text DEFAULT 'RSS' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_source" ADD COLUMN "poll_interval_s" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_source" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "news_source" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "news_source" ADD COLUMN "last_polled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news_source" ADD COLUMN "error_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "news_source" ADD COLUMN "terms_checked_at" date;--> statement-breakpoint
ALTER TABLE "news_source" ADD COLUMN "terms_note" text;