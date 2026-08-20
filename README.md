# 국장레이더 (Gukjang Radar)

뉴스와 국내 상장 종목 사이의 **숨은 연결고리를 발견**하는 AI 서비스.
추천 앱이 아니다. 발견·연결·탐색 앱이다 — 오를 종목이 아니라, 뉴스와 연결된 종목과 *왜* 연결됐는지를 보여준다.

## 절대 규칙

이 저장소를 건드리기 전에 알아야 할 것. 전체는 [`CLAUDE.md`](./CLAUDE.md) 참고.

- **R1** — LLM은 종목을 생성하지 않는다. 후보는 결정론적 그래프 탐색이 만들고, LLM은 그 안에서만 판정한다.
- **R2** — 모든 연결은 경로(`뉴스 → Entity → … → Company`)를 가진다. 경로 없는 연결은 저장·노출 금지.
- **R3** — 모든 엣지는 evidence(출처 URL / DART 문서번호 / 사전 룰 ID)를 가진다. 없으면 `confidence ≤ 0.3` + "미검증" 표시.
- **R4** — `business_relevance`(사업 연관성)와 `meme`(이름·밈 연결)은 하나의 숫자로 합치지 않는다.
- **R5** — 금지어: 추천, 유망주, 수혜주, 급등 예상, 목표가, 매수/매도, 사라, 담아라. CI에서 `lint-forbidden-words`로 강제.
- **R6** — 점수는 미래 수익률 예측이 아니라 "뉴스-종목 연결 강도"다.
- **R7** — 스코어링·그래프 탐색은 `packages/core`의 순수 함수. LLM 호출과 섞지 않는다.

## 스택

| 영역 | 선택 |
|---|---|
| 모노레포 | pnpm workspace + Turborepo |
| `apps/web` | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui |
| `apps/worker` | NestJS + BullMQ (뉴스 수집·AI 파이프라인·스코어 배치) |
| `packages/core` | 도메인 순수 로직 (그래프 탐색, 스코어링, 정규화, 가드레일). 외부 IO 없음 |
| `packages/db` | Drizzle ORM + PostgreSQL 16 (+ pgvector) |
| 캐시/큐 | Redis + BullMQ |
| LLM | Claude API (구조화 출력은 tool_use JSON schema 강제) |
| 시세 | KIS Open API (지연시세) |
| 기업/지배구조 | OpenDART |

## 디렉토리

```
apps/web           Next.js 프론트엔드
apps/worker        NestJS 워커 — 수집/파이프라인/큐
packages/core      순수 도메인 로직 (그래프·스코어링·가드레일)
packages/db        Drizzle 스키마·마이그레이션
spec/              기계가 읽는 단일 진실 원천 (types.ts, schema.sql, openapi.yaml, scoring.config.json, prompts/, golden/)
docs/              설계 문서 (STEP 1~15). 라우팅: docs/00-index.md
infra/postgres/    로컬 DB 초기화 스크립트
scripts/           CI 가드레일 (enum 동기화, 금지어 린터)
```

`spec/`은 정의, `docs/`는 설명이다. enum·DTO가 필요하면 `spec/types.ts`를 읽는다 — 문서에 중복 정의하지 않는다.

## 시작하기

```bash
pnpm install
cp .env.example .env        # ANTHROPIC_API_KEY, KIS_*, DART_API_KEY 등 채우기
docker compose up -d        # postgres(pgvector) + redis
pnpm db:migrate
pnpm dev                    # web:3000, worker
```

### 주요 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm dev` | 전체 앱 개발 서버 (Turborepo) |
| `pnpm build` / `pnpm test` / `pnpm typecheck` / `pnpm lint` | 전체 워크스페이스 |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset` | Drizzle 마이그레이션 |
| `pnpm check-enum-sync` | `spec/schema.sql` ↔ `spec/types.ts` enum 동기화 검증 |
| `pnpm lint-forbidden-words` | R5 금지어 CI 가드레일 |
| `pnpm format` / `format:check` | Prettier |

CI([`​.github/workflows/ci.yml`](./.github/workflows/ci.yml))는 format → lint → typecheck → test → enum-sync → forbidden-words 순으로 돈다.

