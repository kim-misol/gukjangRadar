ALTER TABLE "connection" ADD COLUMN "has_evidence_gap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "is_ambiguous_alias" boolean DEFAULT false NOT NULL;