-- pgvector/pgvector:pg16 이미지는 vector 익스텐션은 기본 포함하지만
-- pg_trgm, pgcrypto 는 명시적으로 생성해야 한다. (spec/schema.sql 참조)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
