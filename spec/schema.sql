-- 국장레이더 schema (PostgreSQL 16)
-- 단일 진실 원천. 변경 시 spec/types.ts 와 packages/db 마이그레이션을 같은 커밋에서 수정할 것.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE market_kind        AS ENUM ('KOSPI','KOSDAQ','KONEX');
CREATE TYPE node_kind          AS ENUM ('NEWS','ENTITY','CONCEPT','COMPANY');
CREATE TYPE entity_kind        AS ENUM ('PERSON','ORG','PLACE','PRODUCT','EVENT','BRAND','WORD','TIME','NUMBER','OTHER');
CREATE TYPE alias_kind         AS ENUM ('OFFICIAL','SHORT','ENGLISH','FORMER','BRAND','TICKER','NICKNAME');

-- 엣지 = 세상에 대한 사실
CREATE TYPE edge_kind          AS ENUM (
  'MENTIONS',        -- news -> entity
  'NAME_MATCH',      -- entity -> company (표기 완전 일치)
  'NAME_SIMILAR',    -- entity -> company (자모 유사)
  'AFFILIATION',     -- company -> company (지주/계열/자회사)
  'SUPPLY_CHAIN',    -- company -> company (납품/고객)
  'PRODUCES',        -- company -> concept (제품/사업)
  'BELONGS_TO',      -- company -> concept (테마/산업)
  'RELATED_CONCEPT', -- concept -> concept
  'PERSON_OF',       -- person entity -> company (임원/오너)
  'LOCATED_IN',      -- company -> place
  'EVENT_IMPACT'     -- event concept -> concept
);

-- 연결 = 특정 뉴스에 대한 해석 결과
CREATE TYPE connection_kind    AS ENUM (
  'DIRECT','SUPPLY_CHAIN','THEME','PERSON','PRODUCT','LOCATION',
  'EVENT','KEYWORD','NAME_MATCH','AFFILIATION','MEME'
);

CREATE TYPE edge_origin        AS ENUM ('RULE','DART','DICTIONARY','LLM','HUMAN','MARKET');
CREATE TYPE connection_state   AS ENUM ('PENDING','ACTIVE','DISPUTED','REJECTED','CORRECTED');
CREATE TYPE analysis_state     AS ENUM ('PENDING','RUNNING','DONE','FAILED','SKIPPED');
CREATE TYPE relevance_band     AS ENUM ('HIGH','MEDIUM','LOW','NONE');
CREATE TYPE feedback_kind      AS ENUM ('UNDERSTOOD','FARFETCHED','WRONG');

-- ============================================================
-- 기업 도메인
-- ============================================================
CREATE TABLE company (
  id            bigserial PRIMARY KEY,
  ticker        char(6)      NOT NULL UNIQUE,       -- 005930
  isin          char(12),
  corp_code     char(8),                            -- OpenDART 고유번호
  name          text         NOT NULL,              -- 정식 사명
  name_norm     text         NOT NULL,              -- 공백/특수문자 제거, 소문자
  name_jamo     text         NOT NULL,              -- 자모 분해 (편집거리용)
  market        market_kind  NOT NULL,
  sector        text,                               -- KRX 업종 대분류
  industry_code text,                               -- 표준산업분류
  is_listed     boolean      NOT NULL DEFAULT true,
  listed_at     date,
  delisted_at   date,
  is_spac       boolean      NOT NULL DEFAULT false,
  is_holding    boolean      NOT NULL DEFAULT false,
  market_cap    bigint,
  -- T1.2.2: DART 기업개황 기반 1~2문장 요약. LLM 없이 결정론적 템플릿으로 생성(+캐시).
  business_summary            text,
  business_summary_updated_at timestamptz,
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX company_name_norm_trgm ON company USING gin (name_norm gin_trgm_ops);
CREATE INDEX company_listed_idx     ON company (is_listed) WHERE is_listed;

CREATE TABLE company_alias (
  id          bigserial PRIMARY KEY,
  company_id  bigint      NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  alias       text        NOT NULL,
  alias_norm  text        NOT NULL,
  alias_jamo  text        NOT NULL,
  alias_type  alias_kind  NOT NULL,
  -- 이 별칭이 일반명사와 충돌하는가 (예: '노루','한샘','대한'). 오탐 억제에 사용.
  is_ambiguous boolean    NOT NULL DEFAULT false,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, alias_norm, alias_type)
);
CREATE INDEX company_alias_norm_trgm ON company_alias USING gin (alias_norm gin_trgm_ops);
CREATE INDEX company_alias_jamo_trgm ON company_alias USING gin (alias_jamo gin_trgm_ops);

-- 개념(테마/산업/제품). 기업도 개체도 아닌 중간 노드.
CREATE TABLE concept (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  name_norm  text NOT NULL,
  kind       text NOT NULL,              -- THEME | INDUSTRY | PRODUCT | MATERIAL | EVENT_TYPE
  description text,
  embedding  vector(1024),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 뉴스 도메인
-- ============================================================
CREATE TABLE news_source (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  domain      text NOT NULL,
  feed_url    text,
  tier        smallint NOT NULL DEFAULT 3,   -- 1=통신사/주요지 ... 3=기타
  is_active   boolean  NOT NULL DEFAULT true
);

-- 본문 미저장 (저작권). 제목/링크/해시만.
CREATE TABLE news_article (
  id           bigserial PRIMARY KEY,
  source_id    int         NOT NULL REFERENCES news_source(id),
  url          text        NOT NULL UNIQUE,
  title        text        NOT NULL,
  lead         text,                       -- 최대 200자, 요약 입력용 임시. 노출 금지.
  published_at timestamptz NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  simhash      bigint,
  lang         char(2)     NOT NULL DEFAULT 'ko',
  is_deleted   boolean     NOT NULL DEFAULT false
);
CREATE INDEX news_article_published_idx ON news_article (published_at DESC);
CREATE INDEX news_article_simhash_idx   ON news_article (simhash);

CREATE TABLE news_cluster (
  id                bigserial PRIMARY KEY,
  headline          text        NOT NULL,       -- 대표 기사 제목(정제)
  emoji             text,
  ai_summary        text,                       -- 3문장
  trade_date        date        NOT NULL,       -- 거래일 기준 버킷
  first_seen_at     timestamptz NOT NULL,
  last_seen_at      timestamptz NOT NULL,
  article_count     int         NOT NULL DEFAULT 1,
  source_tier_min   smallint,
  heat_score        numeric(5,2) NOT NULL DEFAULT 0,   -- 매체수·속도 기반 화제도
  analysis_status   analysis_state NOT NULL DEFAULT 'PENDING',
  analysis_error    text,
  representative_article_id bigint REFERENCES news_article(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_cluster_date_idx ON news_cluster (trade_date, heat_score DESC);

CREATE TABLE cluster_article (
  cluster_id bigint NOT NULL REFERENCES news_cluster(id) ON DELETE CASCADE,
  article_id bigint NOT NULL REFERENCES news_article(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, article_id)
);

CREATE TABLE entity (
  id             bigserial PRIMARY KEY,
  name           text        NOT NULL,
  name_norm      text        NOT NULL,
  name_jamo      text        NOT NULL,
  kind           entity_kind NOT NULL,
  subtype        text,                      -- TYPHOON_NAME, IDOL_MEMBER, POLICY 등 자유 태그
  canonical_id   bigint REFERENCES entity(id),  -- 동의어 병합 대상
  embedding      vector(1024),
  mention_total  int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name_norm, kind)
);
CREATE INDEX entity_norm_trgm ON entity USING gin (name_norm gin_trgm_ops);

CREATE TABLE news_entity (
  cluster_id   bigint NOT NULL REFERENCES news_cluster(id) ON DELETE CASCADE,
  entity_id    bigint NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  importance   numeric(4,3) NOT NULL,        -- 0~1, 뉴스 내 중요도
  mention_count int NOT NULL DEFAULT 1,
  in_headline  boolean NOT NULL DEFAULT false,
  role         text,                          -- SUBJECT | OBJECT | CONTEXT
  PRIMARY KEY (cluster_id, entity_id)
);

-- ============================================================
-- 그래프
-- ============================================================
CREATE TABLE graph_node (
  id         bigserial PRIMARY KEY,
  kind       node_kind NOT NULL,
  ref_id     bigint    NOT NULL,     -- news_cluster.id | entity.id | concept.id | company.id
  label      text      NOT NULL,     -- 렌더용 캐시
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id)
);

CREATE TABLE graph_edge (
  id          bigserial PRIMARY KEY,
  src_node_id bigint      NOT NULL REFERENCES graph_node(id) ON DELETE CASCADE,
  dst_node_id bigint      NOT NULL REFERENCES graph_node(id) ON DELETE CASCADE,
  edge_type   edge_kind   NOT NULL,
  weight      numeric(4,3) NOT NULL DEFAULT 0.5,   -- 0~1, 탐색 감쇠에 사용
  confidence  numeric(4,3) NOT NULL DEFAULT 0.5,   -- 0~1, 이 사실이 참일 확신
  origin      edge_origin NOT NULL,
  -- {"rule":"alias_exact","source":"DART","doc_no":"...","url":"...","label":"노루페인트의 지주회사"}
  evidence    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  valid_from  date,
  valid_to    date,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src_node_id, dst_node_id, edge_type)
);
CREATE INDEX graph_edge_src_idx ON graph_edge (src_node_id, edge_type) WHERE is_active;
CREATE INDEX graph_edge_dst_idx ON graph_edge (dst_node_id, edge_type) WHERE is_active;
-- R3: evidence 없는 엣지는 confidence 0.3 초과 불가
ALTER TABLE graph_edge ADD CONSTRAINT edge_evidence_confidence_chk
  CHECK (evidence <> '{}'::jsonb OR confidence <= 0.3);

-- ============================================================
-- 연결 (파이프라인 산출물)
-- ============================================================
CREATE TABLE connection (
  id                bigserial PRIMARY KEY,
  cluster_id        bigint NOT NULL REFERENCES news_cluster(id) ON DELETE CASCADE,
  company_id        bigint NOT NULL REFERENCES company(id),
  anchor_entity_id  bigint REFERENCES entity(id),        -- 이 연결의 출발 개체
  connection_type   connection_kind NOT NULL,
  trade_date        date   NOT NULL,

  -- 경로 스냅샷 (D-D). [{node_id,kind,label,edge_type?,edge_label?,evidence_url?}]
  path              jsonb  NOT NULL,
  hop_count         smallint NOT NULL,

  -- 점수 0~100
  business_relevance_score smallint NOT NULL,
  keyword_match_score      smallint NOT NULL,
  supply_chain_score       smallint NOT NULL DEFAULT 0,
  market_reaction_score    smallint NOT NULL DEFAULT 0,
  meme_score               smallint NOT NULL DEFAULT 0,
  confidence_score         smallint NOT NULL,
  connection_score         smallint NOT NULL,
  relevance_band           relevance_band NOT NULL,

  explanation       text   NOT NULL,      -- 사용자 노출 한 줄 (금지어 린터 대상)
  caution           text,                 -- "투자자가 오해할 수 있는 부분"
  counter_evidence  text,                 -- 반증 검사 결과 (B6)
  data_sources      jsonb  NOT NULL DEFAULT '[]'::jsonb,

  status            connection_state NOT NULL DEFAULT 'PENDING',
  scoring_version   text   NOT NULL,
  prompt_version    text   NOT NULL,
  llm_run_id        bigint,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cluster_id, company_id, connection_type),
  CHECK (connection_score BETWEEN 0 AND 100),
  CHECK (hop_count BETWEEN 1 AND 5)
);
CREATE INDEX connection_cluster_idx ON connection (cluster_id, connection_score DESC) WHERE status = 'ACTIVE';
CREATE INDEX connection_company_idx ON connection (company_id, trade_date DESC);
CREATE INDEX connection_meme_idx    ON connection (trade_date, meme_score DESC) WHERE status = 'ACTIVE';

CREATE TABLE connection_review (
  id            bigserial PRIMARY KEY,
  connection_id bigint NOT NULL REFERENCES connection(id) ON DELETE CASCADE,
  reviewer      text   NOT NULL,
  action        text   NOT NULL,       -- APPROVE | REJECT | CORRECT
  reason        text,
  patch         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 시장 데이터
-- ============================================================
CREATE TABLE market_snapshot (
  company_id     bigint NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  captured_at    timestamptz NOT NULL,
  trade_date     date   NOT NULL,
  price          integer,
  change_pct     numeric(6,2),
  volume         bigint,
  value_traded   bigint,
  volume_ratio20 numeric(8,2),        -- 20일 평균 대비 배수
  is_delayed     boolean NOT NULL DEFAULT true,
  PRIMARY KEY (company_id, captured_at)
);
CREATE INDEX market_snapshot_date_idx ON market_snapshot (trade_date, change_pct DESC);

-- ============================================================
-- 사용자 / 알림 / 피드백
-- ============================================================
CREATE TABLE app_user (
  id           bigserial PRIMARY KEY,
  email        text UNIQUE,
  provider     text,
  provider_uid text,
  plan         text NOT NULL DEFAULT 'FREE',   -- FREE | PRO | PRO_PLUS (V1에서는 FREE 고정)
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE TABLE alert_keyword (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  keyword      text   NOT NULL,
  keyword_norm text   NOT NULL,
  min_score    smallint NOT NULL DEFAULT 60,
  include_meme boolean  NOT NULL DEFAULT true,
  is_active    boolean  NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword_norm)
);

CREATE TABLE push_subscription (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  endpoint   text   NOT NULL UNIQUE,
  p256dh     text   NOT NULL,
  auth       text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_delivery (
  id            bigserial PRIMARY KEY,
  alert_id      bigint NOT NULL REFERENCES alert_keyword(id) ON DELETE CASCADE,
  cluster_id    bigint NOT NULL REFERENCES news_cluster(id) ON DELETE CASCADE,
  connection_id bigint REFERENCES connection(id),
  sent_at       timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'SENT',
  UNIQUE (alert_id, cluster_id)                -- 동일 클러스터 중복 발송 금지
);

CREATE TABLE connection_feedback (
  id            bigserial PRIMARY KEY,
  connection_id bigint NOT NULL REFERENCES connection(id) ON DELETE CASCADE,
  user_id       bigint REFERENCES app_user(id) ON DELETE SET NULL,
  anon_id       text,
  kind          feedback_kind NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, user_id),
  UNIQUE (connection_id, anon_id)
);

-- 사용자 제보 = 공개 탐색 큐 (PRD D2: 1:1 응답 금지)
CREATE TABLE discovery_request (
  id          bigserial PRIMARY KEY,
  keyword     text NOT NULL,
  user_id     bigint REFERENCES app_user(id) ON DELETE SET NULL,
  upvotes     int NOT NULL DEFAULT 0,
  status      analysis_state NOT NULL DEFAULT 'PENDING',
  result_cluster_id bigint REFERENCES news_cluster(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 감사 / 운영
-- ============================================================
CREATE TABLE llm_run (
  id             bigserial PRIMARY KEY,
  stage          text NOT NULL,          -- SUMMARY | ENTITY | MATCH | EXPLAIN | COUNTER
  prompt_version text NOT NULL,
  model          text NOT NULL,
  input_hash     text NOT NULL,
  input_ref      jsonb,                  -- {cluster_id:..., candidate_ids:[...]}
  output         jsonb,
  input_tokens   int,
  output_tokens  int,
  cost_usd       numeric(10,6),
  latency_ms     int,
  status         text NOT NULL,          -- OK | INVALID_JSON | GUARDRAIL_BLOCKED | ERROR
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_run_created_idx ON llm_run (created_at DESC);
CREATE INDEX llm_run_hash_idx    ON llm_run (input_hash);

-- 가드레일 위반 로그 (13-validation.md)
CREATE TABLE guardrail_violation (
  id           bigserial PRIMARY KEY,
  llm_run_id   bigint REFERENCES llm_run(id) ON DELETE CASCADE,
  cluster_id   bigint,
  rule_id      text NOT NULL,           -- G1..G9
  detail       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
