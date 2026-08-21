# 골든셋

`golden_set.jsonl` — 회귀 테스트 정답셋. 한 줄 = 한 케이스.

## 필드
| 필드 | 뜻 |
|---|---|
| `id` | `G-0xx` 정상 / `G-1xx` 오탐 함정 / `G-2xx` 안전 규칙 |
| `headline` | 입력 뉴스 제목 |
| `anchor_entity` | 기대 앵커 개체 (빈 문자열 = 개체 없어야 정상) |
| `must_include` | 결과에 반드시 있어야 할 티커 |
| `must_exclude` | 결과에 절대 없어야 할 티커 |
| `expect_type` | 기대 connection_type (null = 검사 안 함) |
| `br_range` | businessRelevance 허용 [min, max] |
| `score_range` | connection_score 허용 [min, max] |
| `note` | 이 케이스가 지키는 것 |
| `status` | `OK` / `TODO_FILL_TICKERS` — 실제 종목코드 확인 후 채울 것 |
| `needs_llm` | (선택, 기본 false) 실 LLM의 의미 판단(REJECT)이 있어야만 검증되는 케이스인가 |

## 실행 — `pnpm golden` (T4.1, `scripts/run-golden.ts`)
`ANTHROPIC_API_KEY`가 있으면 실 LLM으로, 없으면 `scripts/lib/reference-judge.ts`의 결정론적
대역(recallRule → connection_type 고정 매핑)으로 심사한다. 대역은 **항상 ACCEPT**하므로
"recall은 후보로 올리지만 LLM이 REJECT해야 하는" 오탐 함정(`needs_llm: true`, 예: 신라→신라젠,
대한민국→대한항공)은 대역으로 검증할 수 없다 — 그런 케이스는 `NEEDS_LLM_REVIEW`로 표시되고
통과율 계산에서 제외된다(거짓 PASS도, 거짓 FAIL도 만들지 않는다). `must_include` 누락은
판정기 종류와 무관하게 항상 진짜 FAIL이다(recall 자체가 실패한 것이므로).

## 현재 상태 (W5, 2026-08-21)
17케이스, 전부 실제 seed 데이터(`packages/db/src/seed.ts`)의 티커·개념사전과 맞춰 `status: OK`다
(이전 버전의 `TODO_FILL_TICKERS`·잘못된 티커는 W5에서 전부 정정됨 — G-003의 032940→240810 등).
대역 판정기 기준 15/15(100%) 통과, `needs_llm` 2건(G-101/G-102)은 검토 보류.

## 주의
`must_include`/`must_exclude` 티커는 반드시 `packages/db/src/seed.ts`의 `SEED_COMPANIES`에 있는
값이어야 한다 — 실 seed에 없는 회사를 참조하면 recall이 그 회사를 절대 찾을 수 없어 항상 FAIL한다.

## 목표
- 최소 40케이스 (정상 10 / 이름 8 / 밈 5 / **오탐 함정 12** / 엣지 5) — 현재 17케이스, 확장은
  진행 중. 특히 `needs_llm` 케이스는 실 API 키가 있는 환경에서 재실행해 실제로 REJECT되는지
  확인해야 완전히 검증됐다고 할 수 있다.
- 통과 기준 95%. CI에서 프롬프트·스코어링·후보검색 변경 시 자동 실행.
- 프로덕션에서 오연결이 발견되면 **고치기 전에 먼저 케이스로 추가**한다.
