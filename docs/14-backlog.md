# STEP 14. 개발 Task 분해 (Epic → Story → Task)

> Task는 **코딩 에이전트 한 세션에 끝나는 크기**로 잘랐다. 각 Task 앞의 `[읽기]`는 그때 읽어야 할 문서.
> 완료 조건(DoD)이 없는 Task는 만들지 않는다.

---
## EPIC 0. 기반 (E0)
### S0.1 모노레포 부트스트랩
- T0.1.1 pnpm workspace + Turborepo, `apps/web`, `apps/worker`, `packages/core`, `packages/db` 스캐폴드 `[읽기: CLAUDE.md]`
- T0.1.2 TypeScript strict, ESLint, Prettier, vitest 공통 설정
- T0.1.3 `.env.example` + zod 환경변수 검증 (`packages/core/env.ts`)
- T0.1.4 Docker Compose: postgres16(+pgvector, pg_trgm), redis
- DoD: `pnpm dev`로 web/worker 동시 기동, `pnpm test` 통과

### S0.2 DB 기반
- T0.2.1 `spec/schema.sql` → Drizzle 스키마 + 최초 마이그레이션 `[읽기: spec/schema.sql, docs/06-erd.md]`
- T0.2.2 `scripts/check-enum-sync.ts` — schema.sql ↔ types.ts enum 일치 검사
- T0.2.3 시드 스크립트(개발용 더미 뉴스 5건 + 기업 20개)
- DoD: 마이그레이션 up/down 성공, enum 동기화 CI 통과

### S0.3 안전 장치 (먼저 만든다)
- T0.3.1 금지어 사전 + `scripts/lint-forbidden-words.ts` `[읽기: docs/01-prd.md §7]`
- T0.3.2 CI 파이프라인 (lint / typecheck / test / enum-sync / forbidden-words)
- DoD: 금지어가 들어간 커밋이 CI에서 막힌다

---
## EPIC 1. 데이터 적재 (E1)
### S1.1 기업 마스터
- T1.1.1 KRX 상장사 목록 수집기 → `company` upsert `[읽기: docs/06-erd.md]`
- T1.1.2 이름 정규화 유틸 (`normalizeName`, `toJamo`) + 단위테스트 `[읽기: docs/09 §2]`
- T1.1.3 별칭 생성기: 정식명/약칭/영문/구사명/티커 → `company_alias`
- T1.1.4 모호 별칭 판별 (국어사전 일반명사 대조 → `is_ambiguous`) `[읽기: docs/12-edge-cases.md §A]`
- DoD: 전 종목 적재, `노루/원익/신라` 별칭이 기대대로 플래그됨

### S1.2 기업 관계 그래프
- T1.2.1 OpenDART 클라이언트 (인증키, 레이트리밋, 재시도)
- T1.2.2 기업개황 → `business_summary` 1~2문장 생성 + 캐시
- T1.2.3 계열/최대주주 → `AFFILIATION` 엣지 + evidence(문서번호)
- T1.2.4 테마/산업 사전 300개 수기 → `concept` + `BELONGS_TO` 엣지
- T1.2.5 공급망 사전 초기 100쌍 → `SUPPLY_CHAIN` 엣지
- DoD: `graph_edge` 5,000행 이상, evidence 없는 엣지 0건

### S1.3 시세
- T1.3.1 KIS Open API 클라이언트 (토큰 갱신, 초당 호출 제한 준수)
- T1.3.2 5분 스냅샷 배치 + `volumeRatio20` 계산
- T1.3.3 장 상태 판별(장전/장중/장후/휴장) 유틸 + 공휴일 캘린더
- DoD: 장중 5분마다 전 종목 스냅샷, 지연 표기 필드 항상 채워짐

---
## EPIC 2. 뉴스 파이프라인 (E2) `[읽기: docs/11-pipeline.md]`
### S2.1 수집·클러스터링
- T2.1.1 RSS/API 수집기 + `news_source` 관리
- T2.1.2 제목 정규화 + simhash 중복 제거
- T2.1.3 클러스터링(자카드 → 임베딩 2단계) + `heat_score`
- DoD: 실데이터 1일치로 기사:클러스터 비율 10:1 이상 압축

### S2.2 AI 분석
- T2.2.1 LLM 클라이언트 래퍼: tool_use 강제, JSON 검증, 재시도, `llm_run` 기록, 비용 상한 `[읽기: docs/11 §4]`
- T2.2.2 요약 잡 (3문장, 인용 20자 제한)
- T2.2.3 개체 추출 잡 + `input_hash` 캐시 `[읽기: spec/prompts/entity_extraction.md]`
- T2.2.4 개체 정규화·병합·불용어 + `graph_node`/`MENTIONS` 엣지
- DoD: "태풍 노루" 입력 시 `노루`(WORD/TYPHOON_NAME) 개체가 나온다

### S2.3 연결 생성 (제품의 심장)
- T2.3.1 Recall 룰 8종 구현 `[읽기: docs/09 §2]`
- T2.3.2 재귀 CTE 그래프 확장 (사이클 방지 + 가지치기) `[읽기: docs/11 §2-⑧]`
- T2.3.3 후보 병합·상한·경로 조립
- T2.3.4 LLM 심사 잡 + closed-world 파서 `[읽기: spec/prompts/company_matching.md]`
- T2.3.5 반증 검사 잡
- T2.3.6 가드레일 G1~G9 `[읽기: docs/13-validation.md §2]`
- T2.3.7 스코어링 엔진 + 단위테스트 `[읽기: docs/10-scoring.md, spec/scoring.config.json]`
- T2.3.8 저장·캐시 무효화
- DoD: 골든셋 G-001~G-006 통과, G-101~G-105 오탐 0

---
## EPIC 3. 웹 (E3) `[읽기: docs/05-screen-specs.md 해당 절만]`
### S3.1 기반
- T3.1.1 App Router 레이아웃, 하단탭 4개, 디자인 토큰
- T3.1.2 API 클라이언트 (openapi-typescript로 타입 생성)
- T3.1.3 공통 컴포넌트: `ConnectionTypeBadge`, `ScoreGauge`, `RelevanceBand`, `DisclaimerBlock`
- DoD: 스토리북/데모 페이지에서 전 상태 렌더

### S3.2 화면
- T3.2.1 홈 5블록 (S1)
- T3.2.2 뉴스 상세 (S2) — 스켈레톤·폴링 포함
- T3.2.3 **연결 그래프 컴포넌트 (S3)** — d3-force, 4레인, 하이라이트, 텍스트 폴백
- T3.2.4 종목 상세 (S4) — 역방향
- T3.2.5 발견 (S5) + OG 이미지 라우트
- T3.2.6 검색 (S6)
- T3.2.7 피드백 위젯
- DoD: Lighthouse 모바일 성능 ≥ 80, 그래프 60노드 60fps

### S3.3 알림
- T3.3.1 소셜 로그인 + JWT 세션
- T3.3.2 알림 키워드 CRUD (S7)
- T3.3.3 웹푸시 구독 + 서비스워커
- T3.3.4 발송 잡 (중복·상한·야간 무음)
- DoD: 키워드 등록 → 매칭 뉴스 발생 → 실제 푸시 도착

---
## EPIC 4. 품질·운영 (E4) `[읽기: docs/13-validation.md]`
- T4.1 골든셋 러너 + `pnpm golden` + CI 연동
- T4.2 관리자 검수 큐 UI (승인/기각/정정)
- T4.3 파이프라인 대시보드(드롭률·지연·비용·G위반)
- T4.4 섀도 모드 실행기
- T4.5 사용자 피드백 → 자동 DISPUTED 승격 로직
- DoD: 프롬프트 변경 PR에서 골든셋이 자동으로 돌고 결과가 코멘트된다

---
## EPIC 5. 출시 (E5)
- T5.1 고지·이용약관·개인정보처리방침 페이지
- T5.2 PWA(매니페스트, 아이콘, iOS 홈화면 안내)
- T5.3 분석 이벤트 설계 (카드조회/그래프열기/공유/피드백/알림등록)
- T5.4 에러 추적(Sentry) + 알람 채널
- T5.5 배포 (Vercel + 워커/DB 호스팅) + 백업
- T5.6 **자본시장법 검토 체크리스트 실행** `[읽기: docs/01-prd.md §7]`

---
## 우선순위 요약
```
반드시 먼저: E0(전부) → E1.1 → E1.2 → E2.1 → E2.2 → E2.3 → E3.1 → E3.2 → E4.1
그 다음:     E1.3 → E3.3 → E4.2 → E5
나중:        E2.3.5(반증), E4.3~4.5, 임베딩 확장
```
