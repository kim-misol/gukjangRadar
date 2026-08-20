CREATE TYPE "public"."alias_kind" AS ENUM('OFFICIAL', 'SHORT', 'ENGLISH', 'FORMER', 'BRAND', 'TICKER', 'NICKNAME');--> statement-breakpoint
CREATE TYPE "public"."analysis_state" AS ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."connection_kind" AS ENUM('DIRECT', 'SUPPLY_CHAIN', 'THEME', 'PERSON', 'PRODUCT', 'LOCATION', 'EVENT', 'KEYWORD', 'NAME_MATCH', 'AFFILIATION', 'MEME');--> statement-breakpoint
CREATE TYPE "public"."connection_state" AS ENUM('PENDING', 'ACTIVE', 'DISPUTED', 'REJECTED', 'CORRECTED');--> statement-breakpoint
CREATE TYPE "public"."edge_kind" AS ENUM('MENTIONS', 'NAME_MATCH', 'NAME_SIMILAR', 'AFFILIATION', 'SUPPLY_CHAIN', 'PRODUCES', 'BELONGS_TO', 'RELATED_CONCEPT', 'PERSON_OF', 'LOCATED_IN', 'EVENT_IMPACT');--> statement-breakpoint
CREATE TYPE "public"."edge_origin" AS ENUM('RULE', 'DART', 'DICTIONARY', 'LLM', 'HUMAN', 'MARKET');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('PERSON', 'ORG', 'PLACE', 'PRODUCT', 'EVENT', 'BRAND', 'WORD', 'TIME', 'NUMBER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."feedback_kind" AS ENUM('UNDERSTOOD', 'FARFETCHED', 'WRONG');--> statement-breakpoint
CREATE TYPE "public"."market_kind" AS ENUM('KOSPI', 'KOSDAQ', 'KONEX');--> statement-breakpoint
CREATE TYPE "public"."node_kind" AS ENUM('NEWS', 'ENTITY', 'CONCEPT', 'COMPANY');--> statement-breakpoint
CREATE TYPE "public"."relevance_band" AS ENUM('HIGH', 'MEDIUM', 'LOW', 'NONE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_delivery" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"alert_id" bigint NOT NULL,
	"cluster_id" bigint NOT NULL,
	"connection_id" bigint,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'SENT' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_keyword" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"keyword" text NOT NULL,
	"keyword_norm" text NOT NULL,
	"min_score" smallint DEFAULT 60 NOT NULL,
	"include_meme" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text,
	"provider" text,
	"provider_uid" text,
	"plan" text DEFAULT 'FREE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cluster_article" (
	"cluster_id" bigint NOT NULL,
	"article_id" bigint NOT NULL,
	CONSTRAINT "cluster_article_cluster_id_article_id_pk" PRIMARY KEY("cluster_id","article_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" char(6) NOT NULL,
	"isin" char(12),
	"corp_code" char(8),
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"name_jamo" text NOT NULL,
	"market" "market_kind" NOT NULL,
	"sector" text,
	"industry_code" text,
	"is_listed" boolean DEFAULT true NOT NULL,
	"listed_at" date,
	"delisted_at" date,
	"is_spac" boolean DEFAULT false NOT NULL,
	"is_holding" boolean DEFAULT false NOT NULL,
	"market_cap" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_alias" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint NOT NULL,
	"alias" text NOT NULL,
	"alias_norm" text NOT NULL,
	"alias_jamo" text NOT NULL,
	"alias_type" "alias_kind" NOT NULL,
	"is_ambiguous" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "concept" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"kind" text NOT NULL,
	"description" text,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connection" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cluster_id" bigint NOT NULL,
	"company_id" bigint NOT NULL,
	"anchor_entity_id" bigint,
	"connection_type" "connection_kind" NOT NULL,
	"trade_date" date NOT NULL,
	"path" jsonb NOT NULL,
	"hop_count" smallint NOT NULL,
	"business_relevance_score" smallint NOT NULL,
	"keyword_match_score" smallint NOT NULL,
	"supply_chain_score" smallint DEFAULT 0 NOT NULL,
	"market_reaction_score" smallint DEFAULT 0 NOT NULL,
	"meme_score" smallint DEFAULT 0 NOT NULL,
	"confidence_score" smallint NOT NULL,
	"connection_score" smallint NOT NULL,
	"relevance_band" "relevance_band" NOT NULL,
	"explanation" text NOT NULL,
	"caution" text,
	"counter_evidence" text,
	"data_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "connection_state" DEFAULT 'PENDING' NOT NULL,
	"scoring_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"llm_run_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_score_range_chk" CHECK ("connection"."connection_score" BETWEEN 0 AND 100),
	CONSTRAINT "connection_hop_count_range_chk" CHECK ("connection"."hop_count" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connection_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"connection_id" bigint NOT NULL,
	"user_id" bigint,
	"anon_id" text,
	"kind" "feedback_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connection_review" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"connection_id" bigint NOT NULL,
	"reviewer" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"patch" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovery_request" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"user_id" bigint,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"status" "analysis_state" DEFAULT 'PENDING' NOT NULL,
	"result_cluster_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"name_jamo" text NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"subtype" text,
	"canonical_id" bigint,
	"embedding" vector(1024),
	"mention_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "graph_edge" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"src_node_id" bigint NOT NULL,
	"dst_node_id" bigint NOT NULL,
	"edge_type" "edge_kind" NOT NULL,
	"weight" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"origin" "edge_origin" NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_evidence_confidence_chk" CHECK ("graph_edge"."evidence" <> '{}'::jsonb OR "graph_edge"."confidence" <= 0.3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "graph_node" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" "node_kind" NOT NULL,
	"ref_id" bigint NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guardrail_violation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"llm_run_id" bigint,
	"cluster_id" bigint,
	"rule_id" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_hash" text NOT NULL,
	"input_ref" jsonb,
	"output" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_snapshot" (
	"company_id" bigint NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"trade_date" date NOT NULL,
	"price" integer,
	"change_pct" numeric(6, 2),
	"volume" bigint,
	"value_traded" bigint,
	"volume_ratio20" numeric(8, 2),
	"is_delayed" boolean DEFAULT true NOT NULL,
	CONSTRAINT "market_snapshot_company_id_captured_at_pk" PRIMARY KEY("company_id","captured_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_article" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"lead" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"simhash" bigint,
	"lang" char(2) DEFAULT 'ko' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "news_article_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_cluster" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"emoji" text,
	"ai_summary" text,
	"trade_date" date NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"article_count" integer DEFAULT 1 NOT NULL,
	"source_tier_min" smallint,
	"heat_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"analysis_status" "analysis_state" DEFAULT 'PENDING' NOT NULL,
	"analysis_error" text,
	"representative_article_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_entity" (
	"cluster_id" bigint NOT NULL,
	"entity_id" bigint NOT NULL,
	"importance" numeric(4, 3) NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"in_headline" boolean DEFAULT false NOT NULL,
	"role" text,
	CONSTRAINT "news_entity_cluster_id_entity_id_pk" PRIMARY KEY("cluster_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_source" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"feed_url" text,
	"tier" smallint DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "news_source_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscription" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_delivery" ADD CONSTRAINT "alert_delivery_alert_id_alert_keyword_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alert_keyword"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_delivery" ADD CONSTRAINT "alert_delivery_cluster_id_news_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."news_cluster"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_delivery" ADD CONSTRAINT "alert_delivery_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_keyword" ADD CONSTRAINT "alert_keyword_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster_article" ADD CONSTRAINT "cluster_article_cluster_id_news_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."news_cluster"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster_article" ADD CONSTRAINT "cluster_article_article_id_news_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_article"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_alias" ADD CONSTRAINT "company_alias_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection" ADD CONSTRAINT "connection_cluster_id_news_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."news_cluster"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection" ADD CONSTRAINT "connection_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection" ADD CONSTRAINT "connection_anchor_entity_id_entity_id_fk" FOREIGN KEY ("anchor_entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection_feedback" ADD CONSTRAINT "connection_feedback_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection_feedback" ADD CONSTRAINT "connection_feedback_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connection_review" ADD CONSTRAINT "connection_review_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovery_request" ADD CONSTRAINT "discovery_request_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovery_request" ADD CONSTRAINT "discovery_request_result_cluster_id_news_cluster_id_fk" FOREIGN KEY ("result_cluster_id") REFERENCES "public"."news_cluster"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity" ADD CONSTRAINT "entity_canonical_id_entity_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "graph_edge" ADD CONSTRAINT "graph_edge_src_node_id_graph_node_id_fk" FOREIGN KEY ("src_node_id") REFERENCES "public"."graph_node"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "graph_edge" ADD CONSTRAINT "graph_edge_dst_node_id_graph_node_id_fk" FOREIGN KEY ("dst_node_id") REFERENCES "public"."graph_node"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guardrail_violation" ADD CONSTRAINT "guardrail_violation_llm_run_id_llm_run_id_fk" FOREIGN KEY ("llm_run_id") REFERENCES "public"."llm_run"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_snapshot" ADD CONSTRAINT "market_snapshot_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_article" ADD CONSTRAINT "news_article_source_id_news_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."news_source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_cluster" ADD CONSTRAINT "news_cluster_representative_article_id_news_article_id_fk" FOREIGN KEY ("representative_article_id") REFERENCES "public"."news_article"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_entity" ADD CONSTRAINT "news_entity_cluster_id_news_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."news_cluster"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_entity" ADD CONSTRAINT "news_entity_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_delivery_alert_cluster_uq" ON "alert_delivery" USING btree ("alert_id","cluster_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_keyword_user_norm_uq" ON "alert_keyword" USING btree ("user_id","keyword_norm");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_user_provider_uid_uq" ON "app_user" USING btree ("provider","provider_uid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_name_norm_trgm" ON "company" USING gin ("name_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_listed_idx" ON "company" USING btree ("is_listed") WHERE "company"."is_listed";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_alias_company_norm_type_uq" ON "company_alias" USING btree ("company_id","alias_norm","alias_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_alias_norm_trgm" ON "company_alias" USING gin ("alias_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_alias_jamo_trgm" ON "company_alias" USING gin ("alias_jamo" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connection_cluster_company_type_uq" ON "connection" USING btree ("cluster_id","company_id","connection_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_cluster_idx" ON "connection" USING btree ("cluster_id","connection_score" DESC NULLS LAST) WHERE "connection"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_company_idx" ON "connection" USING btree ("company_id","trade_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connection_meme_idx" ON "connection" USING btree ("trade_date","meme_score" DESC NULLS LAST) WHERE "connection"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connection_feedback_conn_user_uq" ON "connection_feedback" USING btree ("connection_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connection_feedback_conn_anon_uq" ON "connection_feedback" USING btree ("connection_id","anon_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_norm_kind_uq" ON "entity" USING btree ("name_norm","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_norm_trgm" ON "entity" USING gin ("name_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_canonical_idx" ON "entity" USING btree ("canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "graph_edge_src_dst_type_uq" ON "graph_edge" USING btree ("src_node_id","dst_node_id","edge_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edge_src_idx" ON "graph_edge" USING btree ("src_node_id","edge_type") WHERE "graph_edge"."is_active";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "graph_edge_dst_idx" ON "graph_edge" USING btree ("dst_node_id","edge_type") WHERE "graph_edge"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "graph_node_kind_ref_uq" ON "graph_node" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_run_created_idx" ON "llm_run" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_run_hash_idx" ON "llm_run" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_snapshot_date_idx" ON "market_snapshot" USING btree ("trade_date","change_pct" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_article_published_idx" ON "news_article" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_article_simhash_idx" ON "news_article" USING btree ("simhash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_cluster_date_idx" ON "news_cluster" USING btree ("trade_date","heat_score" DESC NULLS LAST);