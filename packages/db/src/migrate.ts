/**
 * T0.2.1 — 마이그레이션 러너.
 * 실행: pnpm db:migrate
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadEnv } from '@gukjang/core';

async function main(): Promise<void> {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  console.log('마이그레이션 시작…');
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  console.log('✓ 마이그레이션 완료');

  await sql.end();
}

main().catch((err) => {
  console.error('✗ 마이그레이션 실패:', err);
  process.exit(1);
});
