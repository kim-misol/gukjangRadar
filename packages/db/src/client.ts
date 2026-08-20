import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '@gukjang/core';
import * as schema from './schema';

let cachedClient: ReturnType<typeof postgres> | undefined;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** 지연 초기화 — 모듈 import 시점이 아니라 실제로 필요할 때 연결한다. */
export function getDb() {
  if (!cachedDb) {
    const env = loadEnv();
    cachedClient = postgres(env.DATABASE_URL, { max: 10 });
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
