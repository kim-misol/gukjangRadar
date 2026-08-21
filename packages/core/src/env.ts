/**
 * T0.1.3 — 환경변수 zod 검증 (단일 진입점).
 * 다른 패키지/앱은 process.env를 직접 읽지 말고 이 모듈에서 `env`를 import한다.
 * 검증 실패 시 앱 부팅 자체를 막는다 (설정 오류를 런타임 중간에 만나지 않기 위해).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * 모노레포 어느 패키지(cwd)에서 실행되든 리포 루트의 .env를 찾아 로드한다.
 * (drizzle-kit/스크립트는 packages/db 등 하위 디렉터리에서 실행되므로
 * dotenv 기본 동작인 "cwd의 .env"만으로는 못 찾는다.)
 * .env가 없으면 조용히 넘어간다 — CI/프로덕션은 실제 환경변수를 직접 주입한다.
 */
function loadRepoRootEnvFile(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

loadRepoRootEnvFile();

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')
  .default('false');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  ANTHROPIC_API_KEY: z.string().optional(),
  // docs/11 §4: "요약·개체는 저비용 모델, 심사·반증만 고성능 모델" — W4(요약/개체)는 이 모델을 쓴다.
  LLM_MODEL: z.string().default('claude-haiku-4-5'),
  LLM_DAILY_COST_CAP_USD: z.coerce.number().positive().default(20),

  KIS_APP_KEY: z.string().optional(),
  KIS_APP_SECRET: z.string().optional(),
  KIS_ACCOUNT_NO: z.string().optional(),

  DART_API_KEY: z.string().optional(),

  NEXT_PUBLIC_API_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  SESSION_COOKIE_NAME: z.string().default('gr_session'),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),

  // R5/D1: 과금 기능 플래그. V1에서는 반드시 false.
  FEATURE_PAID_PLANS_ENABLED: boolFromString,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * process.env를 파싱해 검증된 Env를 반환한다.
 * 앱 부팅 시 한 번 호출해 실패하면 즉시 프로세스를 종료시킬 것.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`환경변수 검증 실패:\n${message}`);
  }
  cached = parsed.data;
  return cached;
}

/** 테스트 전용: 캐시된 env를 초기화한다. */
export function __resetEnvCacheForTests(): void {
  cached = undefined;
}
