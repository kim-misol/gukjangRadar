# STEP 13. 오연결 방지 검증 시스템

## 0. 왜 4중인가
LLM 하나에 프롬프트로 부탁하는 방식은 반드시 실패한다. 방어선을 층으로 쌓는다.

```
1층 구조적 방어   후보 밖 종목은 물리적으로 생성 불가 (closed-world)
2층 규칙 가드레일  G1~G9 자동 검사, 위반 시 차단·강등
3층 반증 검사     LLM에게 반대 방향 질문을 한 번 더
4층 사람·사용자   관리자 검수 큐 + 사용자 피드백 루프
```

## 1. 1층 — 구조적 방어
- `Candidate[]`의 `companyId` 집합을 파서가 보유. LLM 출력은 이 집합으로 **필터링된 뒤에만** 다음 단계로 간다.
- 경로 없는 연결은 DB 제약(`path` NOT NULL, `hop_count` CHECK)으로 저장 불가.
- evidence 없는 엣지는 `confidence ≤ 0.3` CHECK 제약.
- 즉, **환각 종목이 저장될 경로가 코드 상 존재하지 않는다.** 이게 목표 지표 "환각 0건"의 근거다.

## 2. 2층 — 가드레일 규칙
| ID | 검사 | 위반 시 |
|---|---|---|
| G1 | `company_id ∈ 후보집합` | 항목 폐기 |
| G2 | `explanation`에 후보 밖 기업명/티커 없음 | 설명 폐기, 템플릿 문구로 대체 |
| G3 | 금지어 사전 (추천/수혜주/급등/목표가/매수/매도/유망) | `PENDING` 격리 + 알람 |
| G4 | `type ∈ {MEME, NAME_MATCH}` → `BR ≤ 30` | BR을 30으로 강등 |
| G5 | `used_path_steps` 비어있지 않음 | `confidence −30` |
| G6 | `BR ≥ 60` → `business_summary`에 근거 토큰 존재 | 반증 검사로 강제 이관 |
| G7 | 재난·사망·범죄 뉴스 → 밈 랭킹 제외 | 하드 차단 (12-F5) |
| G8 | 인물 부정 사건 → `MEME` 생성 금지 | 하드 차단 (12-F4) |
| G9 | `hop_count ≤ 4`, 경로에 사이클 없음 | 폐기 |

구현: `packages/core/guardrails/` — **순수 함수 배열**. `applyGuardrails(judgement, ctx) → {passed, mutated, violations[]}`
모든 위반은 `guardrail_violation` 테이블에 기록. 일일 위반 추이가 프롬프트 회귀 조기경보다.

## 3. 3층 — 반증 검사
`09-prompt-company-matching.md §6`(구현 완료, W8 — `apps/worker/src/connections/
counter-check.ts`). `BR ≥ 60`인 연결만 대상(비용 통제).
반박 성공 시 `counter_evidence`에 사유를 남기고 **사용자 화면에도 노출**한다. 이게 신뢰의 원천이다.
> "노루페인트: 도료·페인트 제조업. 최근 사업보고서에서 기상·재해 관련 매출 항목은 확인되지 않았습니다."

## 4. 4층 — 사람과 사용자
### 관리자 검수 큐
`spec/scoring.config.json`의 `reviewTriggers`에 걸린 연결만 큐로 간다:
BR ≥ 80 / score ≥ 90 / meme ≥ 90 / hop ≥ 4 / 모호 별칭 / 반증됨.
목표: **하루 20~40건 이내**. 이 이상이면 트리거를 조인다(사람이 못 버틴다).

액션: APPROVE(`ACTIVE`) / REJECT(`REJECTED`) / CORRECT(`CORRECTED` + patch).
검수를 통과하지 않은 연결은 `connection_score` 상한 95(caps.unreviewedHighScore).

### 사용자 피드백
`FARFETCHED` 비율이 40% 초과 && 표본 20 이상 → 자동 `DISPUTED` + 검수 큐 승격.
`WRONG` 신고 3건 → 즉시 노출 중단 + 검수 큐 최우선.

## 5. 골든셋 회귀 테스트
`spec/golden/golden_set.jsonl` — 케이스당 입력(뉴스 + 개체)과 기대값.

```
필수 검증 항목
  must_include   : 반드시 나와야 하는 티커
  must_exclude   : 절대 나오면 안 되는 티커
  expect_type    : 기대 connection_type
  br_range       : businessRelevance 허용 범위
  score_range    : connection_score 허용 범위
```

실행: `pnpm golden` → `POST /internal/golden/run`
**통과 기준 95%.** CI에서 프롬프트/스코어링/후보검색 변경 시 자동 실행. 실패하면 머지 금지.

케이스 구성(최소 40개):
- 정상 사업 연관 10 (SK하이닉스/HBM 등)
- 이름 일치 8 (노루, 원익 등)
- 밈 5
- **오탐 함정 12** (신라 유적 → 신라젠 안 나와야 함, "대한" 등)
- 엣지케이스 5 (상폐, 스팩, 우선주, 시세 없음, 개체 0개)

**오탐 함정 케이스가 가장 중요하다.** 재현율은 눈에 보이지만 정밀도는 안 보인다.

## 6. 섀도 모드
새 프롬프트/가중치는 프로덕션 트래픽으로 **저장은 하되 노출하지 않는** 섀도 실행을 3일 돌린다.
비교 지표: ACCEPT율, 평균 BR, 유형 분포, 골든셋 통과율, 상위 20 연결의 겹침률(Jaccard).
겹침률이 0.5 미만이면 사람이 눈으로 검토한 뒤에만 승격.

## 7. CI 게이트
| 검사 | 도구 |
|---|---|
| 금지어 린터 (소스·프롬프트·카피 전체) | `scripts/lint-forbidden-words.ts` |
| 골든셋 회귀 | `pnpm golden` |
| `spec/types.ts` ↔ `spec/schema.sql` enum 일치 | `scripts/check-enum-sync.ts` |
| OpenAPI ↔ 라우트 핸들러 일치 | `openapi-typescript` + 타입 체크 |
| 스코어링 단위 테스트 | `vitest`, 커버리지 100% |
| 시세 필드 동반 검사 (D4) | 응답 스키마 테스트 |
