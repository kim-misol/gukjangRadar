/**
 * T0.2.1 — 마이그레이션 러너.
 * 실행: pnpm db:migrate
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolveDatabaseUrl } from './client';

async function main(): Promise<void> {
  const sql = postgres(resolveDatabaseUrl(), { max: 1 });
  const db = drizzle(sql);

  // spec/schema.sql(DDL 원본)이 요구하는 익스텐션. 로컬/CI는 infra/postgres/init.sql이
  // 컨테이너 기동 시 미리 만들어줘서 가려져 있었지만, Neon 등 관리형 Postgres는 그런
  // init 훅이 없어 0000 마이그레이션의 `vector` 컬럼 생성이 그대로 실패한다
  // (2026-08-22, 실제 프로덕션 배포로 확인) — 어떤 Postgres 호스트든 동작하도록
  // 마이그레이션 러너 자체가 보장한다.
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

  console.log('마이그레이션 시작…');
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  console.log('✓ 마이그레이션 완료');

  await sql.end();
}

main().catch((err) => {
  console.error('✗ 마이그레이션 실패:', err);
  process.exit(1);
});
