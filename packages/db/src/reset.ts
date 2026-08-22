/**
 * T0.2.1 DoD 보조 — "마이그레이션 down" 담당.
 * drizzle-kit은 스키마 diff 기반이라 명시적 down 마이그레이션 파일을 만들지 않는다.
 * 로컬 개발에서 완전히 되돌리고 싶을 때는 스키마를 통째로 drop/recreate 한다.
 * 실행: pnpm db:reset (이후 pnpm db:migrate 로 다시 up)
 */
import postgres from 'postgres';
import { resolveDatabaseUrl } from './client';

async function main(): Promise<void> {
  const sql = postgres(resolveDatabaseUrl(), { max: 1 });

  console.log('스키마 초기화(down) 시작…');
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  // drizzle-orm 마이그레이션 추적 테이블(__drizzle_migrations)은 별도의 "drizzle" 스키마에 있어
  // public을 지워도 남는다 — 이것까지 지워야 다음 migrate가 "이미 적용됨"으로 착각하지 않는다.
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  // 익스텐션은 스키마 drop 시 함께 사라지므로 재생성 (infra/postgres/init.sql과 동일)
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  console.log('✓ 스키마 초기화 완료 (테이블 전부 삭제됨). pnpm db:migrate 로 다시 올릴 것.');

  await sql.end();
}

main().catch((err) => {
  console.error('✗ 스키마 초기화 실패:', err);
  process.exit(1);
});
