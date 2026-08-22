import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '@gukjang/core';
import * as schema from './schema';

let cachedClient: ReturnType<typeof postgres> | undefined;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * NODE_ENV=test(manual-verify-*.ts/pnpm golden 등 검증 스크립트 전용)면 DATABASE_URL이
 * 아니라 TEST_DATABASE_URL을 쓴다 — 2026-08-22, 이 스크립트들이 만드는 fixture 데이터가
 * 개발 DB(사람이 pnpm dev로 보는 화면과 같은 DB)에 영구히 쌓여 실 서비스 화면(예: "오늘의
 * 억지 관련주")에 노출되던 문제를 막기 위함. TEST_DATABASE_URL이 없으면 "그냥 개발 DB로
 * 폴백"하지 않고 바로 에러를 던진다 — 조용히 잘못된 DB를 쓰는 것보다 안전하다.
 */
export function resolveDatabaseUrl(): string {
  const env = loadEnv();
  if (env.NODE_ENV !== 'test') return env.DATABASE_URL;
  if (!env.TEST_DATABASE_URL) {
    throw new Error(
      'NODE_ENV=test인데 TEST_DATABASE_URL이 없음 — .env에 설정할 것(개발 DB를 실수로 오염시키지 않기 위한 안전장치).',
    );
  }
  return env.TEST_DATABASE_URL;
}

/** 지연 초기화 — 모듈 import 시점이 아니라 실제로 필요할 때 연결한다. */
export function getDb() {
  if (!cachedDb) {
    cachedClient = postgres(resolveDatabaseUrl(), { max: 10 });
    cachedDb = drizzle(cachedClient, { schema });
  }
  return cachedDb;
}

export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end();
    cachedClient = undefined;
    cachedDb = undefined;
  }
}
