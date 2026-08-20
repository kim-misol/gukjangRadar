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

## 주의
현재 시드 파일의 종목코드는 **설계 예시**다. 개발 시작 시 KRX 상장사 마스터를 적재한 뒤
실제 티커로 교체하고 `status`를 `OK`로 바꿀 것. 교체 전에는 `pnpm golden`이 해당 케이스를 스킵한다.

## 목표
- 최소 40케이스 (정상 10 / 이름 8 / 밈 5 / **오탐 함정 12** / 엣지 5)
- 통과 기준 95%. CI에서 프롬프트·스코어링·후보검색 변경 시 자동 실행.
- 프로덕션에서 오연결이 발견되면 **고치기 전에 먼저 케이스로 추가**한다.
