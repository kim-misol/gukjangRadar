# 문서 라우팅 (토큰 절약용)

작업 유형별로 **아래 표의 파일만** 읽는다.

| 지금 하려는 일 | 읽을 파일 |
|---|---|
| 제품 방향·범위·법적 경계 판단 | `01-prd.md` |
| 화면 흐름/전환 구현 | `02-user-journey.md`, `03-ia.md` |
| "이 기능 V1에 있나?" 확인 | `04-mvp-features.md` |
| 특정 화면 컴포넌트 구현 | `05-screen-specs.md`(해당 섹션만) + `spec/openapi.yaml` |
| DB 작업·마이그레이션 | `06-erd.md` + `spec/schema.sql` |
| API 라우트 구현/수정 | `spec/openapi.yaml` (설명이 필요하면 `07-api-spec.md`) |
| 프롬프트 수정 | `spec/prompts/*.md` (설계 의도는 `08-`, `09-`) |
| 점수 계산 로직 | `10-scoring.md` + `spec/scoring.config.json` |
| 파이프라인/큐/배치 | `11-pipeline.md` |
| 뉴스를 어디서 어떻게 가져오나 (W3) | `16-news-sources.md` + `spec/news_sources.seed.json` |
| 버그가 "이상한 연결" 관련 | `12-edge-cases.md` → `13-validation.md` |
| 다음에 뭘 만들지 | `15-build-order.md` → `14-backlog.md` |
| 배포/호스팅 작업 (W8) | `18-deployment.md` |
| 놓친 게 없는지, 다음에 뭐부터 손댈지 | `19-remaining-work.md` |

## 문서 목록
| 파일 | STEP | 한 줄 |
|---|---|---|
| `01-prd.md` | 1 | 문제·타깃·차별점·성공지표·법적 경계 |
| `02-user-journey.md` | 2 | 3개 페르소나 여정 + 핵심 루프 |
| `03-ia.md` | 3 | 정보구조·라우트·네비게이션 |
| `04-mvp-features.md` | 4 | V1 IN/OUT 기능 목록 (MoSCoW) |
| `05-screen-specs.md` | 5 | 화면별 컴포넌트·상태·API·엣지케이스 |
| `06-erd.md` | 6 | 엔티티 관계 + 그래프 모델 설계 근거 |
| `07-api-spec.md` | 7 | API 설계 원칙 (계약은 openapi.yaml) |
| `08-prompt-entity-extraction.md` | 8 | Entity 추출 설계 |
| `09-prompt-company-matching.md` | 9 | 후보 검증/분류 설계 (closed-world) |
| `10-scoring.md` | 10 | 6개 점수 정의와 공식 |
| `11-pipeline.md` | 11 | 뉴스→종목 12단계 파이프라인 |
| `12-edge-cases.md` | 12 | 실패 사례 카탈로그 |
| `13-validation.md` | 13 | 오연결 방지 4중 방어 + 회귀 테스트 |
| `14-backlog.md` | 14 | Epic → Story → Task |
| `15-build-order.md` | 15 | 8주 MVP 순서 |
| `16-news-sources.md` | 16 | 실시간 이슈 수집 소스 전략 (A/B/C 3층) |
| `18-deployment.md` | 18 | 배포 대상별 스캐폴딩 상태 + 남은 결정 |
| `19-remaining-work.md` | 19 | W1~W8 전체에서 미룬 것/미검증 항목 총정리 (스냅샷) |
