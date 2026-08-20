# 국장레이더 (Gukjang Radar)

> 한국 주식시장의 뉴스와 종목 사이의 **숨은 연결고리를 발견**하는 AI 서비스.
> 추천 앱이 아니다. 발견·연결·탐색 앱이다.

## 0. 이 파일의 용도
코딩 에이전트가 **항상 로드하는 유일한 파일**. 나머지는 필요할 때만 `docs/00-index.md`의 라우팅 표를 보고 골라 읽는다.
전체 문서를 한 번에 읽지 말 것. 토큰 낭비이고 정확도도 떨어진다.

## 1. 절대 규칙 (Non-negotiable)

| # | 규칙 | 이유 |
|---|---|---|
| R1 | **LLM은 종목을 "생성"하지 않는다.** 후보는 결정론적 검색(그래프+사전+인덱스)으로 만들고, LLM은 그 후보 집합 안에서만 검증·분류·설명한다. | 환각 종목 = 서비스 사망 |
| R2 | 모든 연결은 **경로(path)** 를 가진다. `뉴스 → Entity → … → Company`. 경로 없는 연결은 저장·노출 금지. | 그래프가 제품의 핵심 |
| R3 | 모든 엣지는 **evidence**(출처 URL / DART 문서번호 / 사전 룰 ID)를 가진다. evidence 없으면 `confidence ≤ 0.3`으로 강등되고 UI에서 "미검증" 표시. | 검증 가능성 |
| R4 | `business_relevance`(사업 연관성)와 `keyword/meme`(이름·밈 연결)은 **절대 하나의 숫자로 합쳐 보여주지 않는다.** | 오해 방지, 서비스 정체성 |
| R5 | UX 카피에 **금지어**를 쓰지 않는다: 추천, 유망주, 수혜주, 급등 예상, 목표가, 매수/매도, 사라, 담아라. 대체어: 발견, 연결, 탐색, 관심 가능성, 시장 반응. | 자본시장법 리스크 → `docs/01-prd.md#7` |
| R6 | 점수는 **미래 수익률 예측이 아니라 "뉴스-종목 연결 강도"** 이다. 문구·툴팁·API 필드 설명 모두 이 정의를 따른다. | 동상 |
| R7 | 스코어링·그래프 탐색은 **순수 함수**로 `packages/core`에 둔다. LLM 호출과 섞지 않는다. | 테스트·재현성 |

## 2. 스택 (확정)
- 모노레포: pnpm workspace + Turborepo
- `apps/web` — Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui
- `apps/worker` — NestJS + BullMQ (뉴스 수집·AI 파이프라인·스코어 배치)
- `packages/core` — 도메인 순수 로직 (그래프 탐색, 스코어링, 정규화, 가드레일). 외부 IO 없음.
- `packages/db` — Drizzle ORM + PostgreSQL 16 (+ pgvector). 재귀 CTE를 자주 쓰므로 raw SQL 친화 ORM 선택.
- Redis — 캐시 + BullMQ 큐
- LLM — Claude API (구조화 출력은 tool_use JSON schema 강제)
- 시세 — KIS Open API (지연시세), 기업/지배구조 — OpenDART

## 3. 디렉토리
```
apps/web  apps/worker  packages/core  packages/db  spec/  docs/
```
`spec/`은 **기계가 읽는 단일 진실 원천**이다. 문서(`docs/`)는 설명, 스펙(`spec/`)은 정의.
- `spec/types.ts` — 모든 enum·DTO 타입. **enum을 문서에 중복 정의하지 말 것.**
- `spec/schema.sql` — DDL 원본
- `spec/openapi.yaml` — API 계약
- `spec/scoring.config.json` — 가중치(코드에 하드코딩 금지)
- `spec/prompts/*.md` — LLM 프롬프트 원본
- `spec/golden/golden_set.jsonl` — 회귀 테스트 정답셋

## 4. 작업할 때
1. `docs/00-index.md`에서 관련 문서 1~2개만 고른다.
2. 타입·enum이 필요하면 `spec/types.ts`를 읽는다(문서 말고).
3. 스키마를 바꿔야 하면 `spec/schema.sql` + `packages/db` 마이그레이션 + `spec/types.ts`를 **같은 커밋**에서 함께 고친다.
4. 새 연결 유형·가중치를 추가하면 `spec/golden/golden_set.jsonl`에 케이스를 추가한다.

## 5. 워크플로우 (TDD)
새 로직(특히 `packages/core`, 파이프라인 단계, 스코어링 규칙)을 만들거나 고칠 때는 항상 TDD로 진행한다.
1. **Red** — 원하는 동작을 표현하는 실패하는 테스트를 먼저 쓴다. 새 연결 유형·스코어링 규칙을 추가하는 경우 `spec/golden/golden_set.jsonl` 케이스도 같이 추가한다(§4-4).
2. **Green** — 테스트를 통과시키는 최소 구현만 한다. 앞서가서 다음 기능까지 만들지 않는다.
3. **Refactor** — 테스트가 초록인 상태를 유지하며 정리한다. 테스트 자체는 동작이 바뀌는 게 아니면 건드리지 않는다.

- 테스트 실행: `make test`(전체) 또는 `pnpm --filter <pkg> test`(해당 워크스페이스만, 예: `@gukjang/core`).
- 커밋 전에 로컬에서 CI와 동일한 게이트를 통과시킨다: `make ci`
  (format-check → lint → typecheck → test → check-enum-sync → lint-forbidden-words, `.github/workflows/ci.yml`과 동일 순서).
- 커밋 메시지:
  - 제목: `type(scope): 요약` (`type` = `feat|fix|refactor|test|chore|docs`, `scope` = 주차 예: `W1` 또는 패키지명)
  - 본문: 변경 사항을 불릿으로, 마지막 줄에 `DoD verified: ...`로 무엇을 어떻게 확인했는지 남긴다(테스트 통과만으로 부족하면 수동 확인 내용도 적는다).
  - 기존 커밋(`git log`) 스타일을 그대로 따른다.

## 6. 용어 (한/영 고정)
| 한글 | 코드 | 뜻 |
|---|---|---|
| 개체 | `entity` | 뉴스에서 뽑은 사람/장소/제품/사건/단어 |
| 연결 | `connection` | 뉴스 ↔ 기업 사이의 **경로가 있는** 관계 |
| 엣지 | `edge` | 그래프의 한 칸 (Entity→Company 등) |
| 경로 | `path` | 엣지의 나열. 화면의 "왜 발견됐나요?" |
| 연결 강도 | `connection_score` | 0~100, 미래 예측 아님 |
| 억지 관련주 | `meme connection` | `connection_type = MEME` 이거나 `meme_score ≥ 70` |
