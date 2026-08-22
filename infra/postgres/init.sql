-- pgvector/pgvector:pg16 이미지는 vector 익스텐션은 기본 포함하지만
-- pg_trgm, pgcrypto 는 명시적으로 생성해야 한다. (spec/schema.sql 참조)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- manual-verify-*.ts/pnpm golden 전용 격리 DB(2026-08-22 도입, CLAUDE.md §5 참고) —
-- 개발 DB(위 gukjang_radar)에 테스트 픽스처가 쌓여 실 서비스 화면에 노출되는 걸 막는다.
CREATE DATABASE gukjang_radar_test;
\connect gukjang_radar_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
