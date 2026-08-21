/**
 * Drizzle 스키마 — spec/schema.sql 의 1:1 번역 (T0.2.1).
 * 단일 진실 원천은 spec/schema.sql 이다. 이 파일을 고칠 때는 반드시
 * spec/schema.sql 과 spec/types.ts 도 같은 커밋에서 함께 갱신할 것 (CLAUDE.md §3, §4-3).
 *
 * ENUM 값은 직접 나열하지 않고 @gukjang/spec 의 `as const` 배열을 그대로 사용해
 * enum 드리프트를 구조적으로 방지한다.
 */
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  MARKETS,
  NODE_KINDS,
  ENTITY_KINDS,
  ALIAS_KINDS,
  EDGE_KINDS,
  CONNECTION_KINDS,
  EDGE_ORIGINS,
  CONNECTION_STATES,
  ANALYSIS_STATES,
  RELEVANCE_BANDS,
  FEEDBACK_KINDS,
} from '@gukjang/spec';

// ─────────────────────────────────────────────
// pgvector 커스텀 타입 (drizzle-orm은 vector를 내장 타입으로 제공하지 않는다)
// ─────────────────────────────────────────────
const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(',').filter(Boolean).map(Number);
    },
  })(name);

// ─────────────────────────────────────────────
// Enums (spec/types.ts 의 as const 배열을 그대로 사용)
// ─────────────────────────────────────────────
export const marketKind = pgEnum('market_kind', [...MARKETS]);
export const nodeKind = pgEnum('node_kind', [...NODE_KINDS]);
export const entityKind = pgEnum('entity_kind', [...ENTITY_KINDS]);
export const aliasKind = pgEnum('alias_kind', [...ALIAS_KINDS]);
export const edgeKind = pgEnum('edge_kind', [...EDGE_KINDS]);
export const connectionKind = pgEnum('connection_kind', [...CONNECTION_KINDS]);
export const edgeOrigin = pgEnum('edge_origin', [...EDGE_ORIGINS]);
export const connectionState = pgEnum('connection_state', [...CONNECTION_STATES]);
export const analysisState = pgEnum('analysis_state', [...ANALYSIS_STATES]);
export const relevanceBand = pgEnum('relevance_band', [...RELEVANCE_BANDS]);
export const feedbackKind = pgEnum('feedback_kind', [...FEEDBACK_KINDS]);

// ─────────────────────────────────────────────
// 기업 도메인
// ─────────────────────────────────────────────
export const company = pgTable(
  'company',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticker: char('ticker', { length: 6 }).notNull().unique(),
    isin: char('isin', { length: 12 }),
    corpCode: char('corp_code', { length: 8 }),
    name: text('name').notNull(),
    nameNorm: text('name_norm').notNull(),
    nameJamo: text('name_jamo').notNull(),
    market: marketKind('market').notNull(),
    sector: text('sector'),
    industryCode: text('industry_code'),
    isListed: boolean('is_listed').notNull().default(true),
    listedAt: date('listed_at'),
    delistedAt: date('delisted_at'),
    isSpac: boolean('is_spac').notNull().default(false),
    isHolding: boolean('is_holding').notNull().default(false),
    marketCap: bigint('market_cap', { mode: 'number' }),
    // T1.2.2: DART 기업개황 기반 1~2문장 요약. LLM 없이 결정론적 템플릿으로 생성(+캐시).
    businessSummary: text('business_summary'),
    businessSummaryUpdatedAt: timestamp('business_summary_updated_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('company_name_norm_trgm').using('gin', sql`${t.nameNorm} gin_trgm_ops`),
    index('company_listed_idx')
      .on(t.isListed)
      .where(sql`${t.isListed}`),
  ],
);

export const companyAlias = pgTable(
  'company_alias',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    aliasNorm: text('alias_norm').notNull(),
    aliasJamo: text('alias_jamo').notNull(),
    aliasType: aliasKind('alias_type').notNull(),
    isAmbiguous: boolean('is_ambiguous').notNull().default(false),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('company_alias_company_norm_type_uq').on(t.companyId, t.aliasNorm, t.aliasType),
    index('company_alias_norm_trgm').using('gin', sql`${t.aliasNorm} gin_trgm_ops`),
    index('company_alias_jamo_trgm').using('gin', sql`${t.aliasJamo} gin_trgm_ops`),
  ],
);

export const concept = pgTable('concept', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull().unique(),
  nameNorm: text('name_norm').notNull(),
  kind: text('kind').notNull(),
  description: text('description'),
  embedding: vector('embedding', 1024),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// 뉴스 도메인
// ─────────────────────────────────────────────
export const newsSource = pgTable('news_source', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  domain: text('domain').notNull(),
  feedUrl: text('feed_url'),
  tier: smallint('tier').notNull().default(3),
  isActive: boolean('is_active').notNull().default(true),
  kind: text('kind').notNull().default('RSS'),
  pollIntervalS: integer('poll_interval_s').notNull().default(120),
  etag: text('etag'),
  lastModified: text('last_modified'),
  lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
  errorCount: integer('error_count').notNull().default(0),
  termsCheckedAt: date('terms_checked_at'),
  termsNote: text('terms_note'),
});

export const newsArticle = pgTable(
  'news_article',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceId: integer('source_id')
      .notNull()
      .references(() => newsSource.id),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    lead: text('lead'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    simhash: bigint('simhash', { mode: 'number' }),
    lang: char('lang', { length: 2 }).notNull().default('ko'),
    isDeleted: boolean('is_deleted').notNull().default(false),
  },
  (t) => [
    index('news_article_published_idx').on(t.publishedAt.desc()),
    index('news_article_simhash_idx').on(t.simhash),
  ],
);

export const newsCluster = pgTable(
  'news_cluster',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    headline: text('headline').notNull(),
    emoji: text('emoji'),
    aiSummary: text('ai_summary'),
    tradeDate: date('trade_date').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    articleCount: integer('article_count').notNull().default(1),
    sourceTierMin: smallint('source_tier_min'),
    heatScore: numeric('heat_score', { precision: 5, scale: 2 }).notNull().default('0'),
    analysisStatus: analysisState('analysis_status').notNull().default('PENDING'),
    analysisError: text('analysis_error'),
    representativeArticleId: bigint('representative_article_id', { mode: 'number' }).references(
      () => newsArticle.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('news_cluster_date_idx').on(t.tradeDate, t.heatScore.desc())],
);

export const clusterArticle = pgTable(
  'cluster_article',
  {
    clusterId: bigint('cluster_id', { mode: 'number' })
      .notNull()
      .references(() => newsCluster.id, { onDelete: 'cascade' }),
    articleId: bigint('article_id', { mode: 'number' })
      .notNull()
      .references(() => newsArticle.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.clusterId, t.articleId] })],
);

export const entity = pgTable(
  'entity',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    nameNorm: text('name_norm').notNull(),
    nameJamo: text('name_jamo').notNull(),
    kind: entityKind('kind').notNull(),
    subtype: text('subtype'),
    // 동의어 병합 대상 — 자기참조 FK. 콜백으로 지연 평가해 순환 참조를 피한다.
    canonicalId: bigint('canonical_id', { mode: 'number' }).references(
      (): AnyPgColumn => entity.id,
    ),
    embedding: vector('embedding', 1024),
    mentionTotal: integer('mention_total').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('entity_norm_kind_uq').on(t.nameNorm, t.kind),
    index('entity_norm_trgm').using('gin', sql`${t.nameNorm} gin_trgm_ops`),
    index('entity_canonical_idx').on(t.canonicalId),
  ],
);

export const newsEntity = pgTable(
  'news_entity',
  {
    clusterId: bigint('cluster_id', { mode: 'number' })
      .notNull()
      .references(() => newsCluster.id, { onDelete: 'cascade' }),
    entityId: bigint('entity_id', { mode: 'number' })
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    importance: numeric('importance', { precision: 4, scale: 3 }).notNull(),
    mentionCount: integer('mention_count').notNull().default(1),
    inHeadline: boolean('in_headline').notNull().default(false),
    role: text('role'),
  },
  (t) => [primaryKey({ columns: [t.clusterId, t.entityId] })],
);

// ─────────────────────────────────────────────
// 그래프
// ─────────────────────────────────────────────
export const graphNode = pgTable(
  'graph_node',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: nodeKind('kind').notNull(),
    refId: bigint('ref_id', { mode: 'number' }).notNull(),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('graph_node_kind_ref_uq').on(t.kind, t.refId)],
);

export const graphEdge = pgTable(
  'graph_edge',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    srcNodeId: bigint('src_node_id', { mode: 'number' })
      .notNull()
      .references(() => graphNode.id, { onDelete: 'cascade' }),
    dstNodeId: bigint('dst_node_id', { mode: 'number' })
      .notNull()
      .references(() => graphNode.id, { onDelete: 'cascade' }),
    edgeType: edgeKind('edge_type').notNull(),
    weight: numeric('weight', { precision: 4, scale: 3 }).notNull().default('0.5'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('0.5'),
    origin: edgeOrigin('origin').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('graph_edge_src_dst_type_uq').on(t.srcNodeId, t.dstNodeId, t.edgeType),
    index('graph_edge_src_idx')
      .on(t.srcNodeId, t.edgeType)
      .where(sql`${t.isActive}`),
    index('graph_edge_dst_idx')
      .on(t.dstNodeId, t.edgeType)
      .where(sql`${t.isActive}`),
    // R3: evidence 없는 엣지는 confidence 0.3 초과 불가
    check(
      'edge_evidence_confidence_chk',
      sql`${t.evidence} <> '{}'::jsonb OR ${t.confidence} <= 0.3`,
    ),
  ],
);

// ─────────────────────────────────────────────
// 연결 (파이프라인 산출물)
// ─────────────────────────────────────────────
export const connection = pgTable(
  'connection',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clusterId: bigint('cluster_id', { mode: 'number' })
      .notNull()
      .references(() => newsCluster.id, { onDelete: 'cascade' }),
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    anchorEntityId: bigint('anchor_entity_id', { mode: 'number' }).references(() => entity.id),
    connectionType: connectionKind('connection_type').notNull(),
    tradeDate: date('trade_date').notNull(),

    path: jsonb('path').notNull(),
    hopCount: smallint('hop_count').notNull(),

    businessRelevanceScore: smallint('business_relevance_score').notNull(),
    keywordMatchScore: smallint('keyword_match_score').notNull(),
    supplyChainScore: smallint('supply_chain_score').notNull().default(0),
    marketReactionScore: smallint('market_reaction_score').notNull().default(0),
    memeScore: smallint('meme_score').notNull().default(0),
    confidenceScore: smallint('confidence_score').notNull(),
    connectionScore: smallint('connection_score').notNull(),
    relevanceBand: relevanceBand('relevance_band').notNull(),

    explanation: text('explanation').notNull(),
    caution: text('caution'),
    counterEvidence: text('counter_evidence'),
    dataSources: jsonb('data_sources').notNull().default([]),

    status: connectionState('status').notNull().default('PENDING'),
    scoringVersion: text('scoring_version').notNull(),
    promptVersion: text('prompt_version').notNull(),
    llmRunId: bigint('llm_run_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('connection_cluster_company_type_uq').on(
      t.clusterId,
      t.companyId,
      t.connectionType,
    ),
    index('connection_cluster_idx')
      .on(t.clusterId, t.connectionScore.desc())
      .where(sql`${t.status} = 'ACTIVE'`),
    index('connection_company_idx').on(t.companyId, t.tradeDate.desc()),
    index('connection_meme_idx')
      .on(t.tradeDate, t.memeScore.desc())
      .where(sql`${t.status} = 'ACTIVE'`),
    check('connection_score_range_chk', sql`${t.connectionScore} BETWEEN 0 AND 100`),
    check('connection_hop_count_range_chk', sql`${t.hopCount} BETWEEN 1 AND 5`),
  ],
);

export const connectionReview = pgTable('connection_review', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  connectionId: bigint('connection_id', { mode: 'number' })
    .notNull()
    .references(() => connection.id, { onDelete: 'cascade' }),
  reviewer: text('reviewer').notNull(),
  action: text('action').notNull(),
  reason: text('reason'),
  patch: jsonb('patch'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// 시장 데이터
// ─────────────────────────────────────────────
export const marketSnapshot = pgTable(
  'market_snapshot',
  {
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    tradeDate: date('trade_date').notNull(),
    price: integer('price'),
    changePct: numeric('change_pct', { precision: 6, scale: 2 }),
    volume: bigint('volume', { mode: 'number' }),
    valueTraded: bigint('value_traded', { mode: 'number' }),
    volumeRatio20: numeric('volume_ratio20', { precision: 8, scale: 2 }),
    isDelayed: boolean('is_delayed').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.capturedAt] }),
    index('market_snapshot_date_idx').on(t.tradeDate, t.changePct.desc()),
  ],
);

// ─────────────────────────────────────────────
// 사용자 / 알림 / 피드백
// ─────────────────────────────────────────────
export const appUser = pgTable(
  'app_user',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').unique(),
    provider: text('provider'),
    providerUid: text('provider_uid'),
    plan: text('plan').notNull().default('FREE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('app_user_provider_uid_uq').on(t.provider, t.providerUid)],
);

export const alertKeyword = pgTable(
  'alert_keyword',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    keyword: text('keyword').notNull(),
    keywordNorm: text('keyword_norm').notNull(),
    minScore: smallint('min_score').notNull().default(60),
    includeMeme: boolean('include_meme').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('alert_keyword_user_norm_uq').on(t.userId, t.keywordNorm)],
);

export const pushSubscription = pgTable('push_subscription', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alertDelivery = pgTable(
  'alert_delivery',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    alertId: bigint('alert_id', { mode: 'number' })
      .notNull()
      .references(() => alertKeyword.id, { onDelete: 'cascade' }),
    clusterId: bigint('cluster_id', { mode: 'number' })
      .notNull()
      .references(() => newsCluster.id, { onDelete: 'cascade' }),
    connectionId: bigint('connection_id', { mode: 'number' }).references(() => connection.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('SENT'),
  },
  (t) => [uniqueIndex('alert_delivery_alert_cluster_uq').on(t.alertId, t.clusterId)],
);

export const connectionFeedback = pgTable(
  'connection_feedback',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    connectionId: bigint('connection_id', { mode: 'number' })
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' }).references(() => appUser.id, {
      onDelete: 'set null',
    }),
    anonId: text('anon_id'),
    kind: feedbackKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('connection_feedback_conn_user_uq').on(t.connectionId, t.userId),
    uniqueIndex('connection_feedback_conn_anon_uq').on(t.connectionId, t.anonId),
  ],
);

// 사용자 제보 = 공개 탐색 큐 (PRD D2: 1:1 응답 금지)
export const discoveryRequest = pgTable('discovery_request', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  keyword: text('keyword').notNull(),
  userId: bigint('user_id', { mode: 'number' }).references(() => appUser.id, {
    onDelete: 'set null',
  }),
  upvotes: integer('upvotes').notNull().default(0),
  status: analysisState('status').notNull().default('PENDING'),
  resultClusterId: bigint('result_cluster_id', { mode: 'number' }).references(() => newsCluster.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// 감사 / 운영
// ─────────────────────────────────────────────
export const llmRun = pgTable(
  'llm_run',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    stage: text('stage').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    inputHash: text('input_hash').notNull(),
    inputRef: jsonb('input_ref'),
    output: jsonb('output'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    latencyMs: integer('latency_ms'),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('llm_run_created_idx').on(t.createdAt.desc()),
    index('llm_run_hash_idx').on(t.inputHash),
  ],
);

export const guardrailViolation = pgTable('guardrail_violation', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  llmRunId: bigint('llm_run_id', { mode: 'number' }).references(() => llmRun.id, {
    onDelete: 'cascade',
  }),
  clusterId: bigint('cluster_id', { mode: 'number' }),
  ruleId: text('rule_id').notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
