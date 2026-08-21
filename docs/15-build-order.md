# STEP 15. MVP 개발 순서 (8주)

> 전제: 1인 개발 + 코딩 에이전트. 주 25~30시간.
> 원칙: **가장 무서운 것부터 만든다.** 예쁜 화면은 마지막이다.

## W1 — 기반과 안전장치 ✅ 완료 (2026-08-20)
E0 전체.
주말까지: `pnpm dev` 기동, 마이그레이션 성공, 금지어 린터가 CI에서 커밋을 막는다.
> 금지어 린터를 1주차에 넣는 이유: 나중에 넣으면 이미 쌓인 카피를 다 고쳐야 한다.

**진행 기록**: pnpm workspace+Turborepo 스캐폴드(apps/web, apps/worker, packages/core,
packages/db), spec/를 워크스페이스 패키지로 승격, zod env 검증, Drizzle로 schema.sql
22테이블 번역 + 마이그레이션 up/down/seed(기업 20+뉴스 5) 실제 postgres에서 검증,
금지어 가드레일(순수 함수 + CI 린터, D3 고지 문구는 안전 문구 allowlist), GitHub Actions CI.
클린 설치부터 lint/typecheck/test/build 전부 통과, `pnpm dev`로 web(3000)/worker(4000)
동시 기동 확인. 상세 기록: 프로젝트 문서 `progress/w1-status.md`.

## W2 — 기업 데이터와 이름 인덱스 ✅ 완료 (2026-08-20)
E1.1 + E1.2(T1.2.1~1.2.3).
**이 주가 프로젝트의 성패를 가른다.** 별칭 인덱스와 자모 유사도가 부실하면 이 서비스는 존재 이유가 없다.
검증: 콘솔 스크립트로 `노루` → 노루페인트/노루홀딩스, `원희` → 원익 후보가 나오는지 확인.
아직 LLM은 한 줄도 안 붙였는데 **핵심 마법이 이미 동작해야 한다.**

**진행 기록**: 이름 정규화/자모 분해/자모 유사도(packages/core/src/normalize)와 별칭 생성·모호
별칭 판별(packages/core/src/alias)로 company_alias 실데이터(기업 20개, 별칭 46개)를 채우고,
`pnpm verify-name-index`로 W2 게이트를 실제 로컬 postgres에서 확인: "노루" → 노루홀딩스
(ALIAS_EXACT, SHORT별칭)·노루페인트(ALIAS_PREFIX), "원희" → 원익IPS/원익홀딩스(자모유사도
0.6 미만이지만 첫 음절 공유로 ALIAS_PREFIX 병합) — docs/09 §2 규칙 그대로 재현됨.
OpenDART 클라이언트(T1.2.1)·business_summary 생성+캐시(T1.2.2)·최대주주 기반 AFFILIATION
엣지(T1.2.3)까지 구현. company에 business_summary/business_summary_updated_at 컬럼 추가
(마이그레이션 0001). 샌드박스 네트워크가 OpenDART를 막고 있어(KRX/도커허브도 막힘 — W1 기록
참조) 실제 API 응답으로 검증하진 못했지만, `pnpm manual-verify-dart-sync`로 fake DART
client + 실제 로컬 postgres를 붙여 전체 파이프라인을 실행 확인: business_summary 생성·캐시
동작(2회차 실행 시 재조회 0건), docs/06-erd.md §3 예시(노루페인트→노루홀딩스, type=AFFILIATION,
evidence={"source":"DART",...})를 그대로 재현하는 graph_edge 실제 생성 확인.
클린 typecheck/lint/test(60개)/build/check-enum-sync/lint-forbidden-words/format:check 전부
통과. 실 API 키·네트워크가 있는 환경에서 DartClient/KrxListingClient 라이브 실행 재검증 필요.
상세 기록: 프로젝트 문서 `progress/w2-status.md`.

## W3 — 뉴스 수집과 클러스터링 ✅ 완료 (2026-08-21)
E2.1(T2.1.1~1.3) + docs/16-news-sources.md A층(RSS) 수집 확장.
검증: 하루치 실데이터에서 기사 3,000건 → 클러스터 200건 이하. 피드를 눈으로 훑어 중복이 없는지 확인.
추가 게이트(docs/16 §7): ①Google Trends 급상승 키워드가 5분 주기로 들어온다, ②A층/C층이
originallink canonical로 중복 없이 병합된다.
> 여기서 압축이 안 되면 W4의 LLM 비용이 20배가 된다. 반드시 통과하고 넘어갈 것.

**진행 기록**: packages/core/src/news/에 순수 함수로 제목 정규화(대괄호 접두·매체명 접미·
전각→반각·따옴표 통일), URL canonical 정규화(트래킹 파라미터 제거·쿼리 정렬 — docs/16 §1),
32비트 simhash+해밍거리 dedup, 자카드(문자 2-gram) 기반 클러스터 매칭(2차 임베딩 코사인은
공급자 미정이라 인터페이스만 두고 worker에서 호출 안 함), heat_score(`spec/scoring.config.json`
heatScore 섹션, 하드코딩 금지 원칙 유지), robots.txt 파서까지 TDD로 구현(packages/core
127개 테스트).
apps/worker에 RssClient(ETag/If-Modified-Since 조건부요청+304, robots.txt 확인 후 금지 시
자동 is_active=false, 재시도)·TrendsClient(Google Trends KR, B-1층)·syncNewsCollect(T2.1.1,
연속 실패 10회 자동비활성화)·clusterNewArticles(T2.1.2+1.3 dedup+클러스터링) 구현, 실제
BullMQ로 `news.collect`(cron 2분·07~20시 KST)→`news.cluster`(완료 트리거) 큐 배선
(apps/worker/src/pipeline/, docs/11 §1 그대로).

news_source에 kind/poll_interval_s/etag/last_modified/last_polled_at/error_count/
terms_checked_at/terms_note 컬럼 추가(마이그레이션 0002, spec/schema.sql·
packages/db/src/schema.ts 동시 수정) + spec/news_sources.seed.json(docs/16에서 실 네트워크로
검증한 A/B/C층 14개 소스)을 단일 진실 원천으로 삼아 packages/db/src/seed.ts가 그대로 읽어
채운다.

**실 네트워크 검증**(이 환경은 KRX/DART와 달리 아웃바운드가 열려 있었다): 실제 RssClient로
이데일리·한국경제·SBS 피드를 라이브로 수집해 79건 실기사 적재(이데일리 1건 일시 실패 →
error_count 정상 증가 확인, 나머지 정상), 근접 중복 실기사 3건 정상 제거. TrendsClient도
`https://trends.google.com/trending/rss?geo=KR`에서 급상승 검색어 10건 + 관련기사까지 실제
파싱 성공. 연합뉴스/매일경제 RSS는 이 환경에서도 403(docs/16 기록과 동일 — 실 서비스
배포 환경에서 재확인 필요, spec/news_sources.seed.json에 is_active=false로 반영됨).

**W3 게이트(≥10:1) 재현**: `pnpm manual-verify-news-pipeline` — 5개 "핫 스토리"를 매체별로
다른 표현 80건 + 명시적 근접중복 4건(총 84건) fixture로 투입 → simhash dedup 17건 제거 →
자카드 클러스터링으로 정확히 5개 클러스터(스토리당 1개, 조각남 없음)로 수렴 → 생존기사
67건/클러스터5건 = **13.4:1** (게이트 10:1 이상 충족). 재실행 시 신규 insert/clustering
0건으로 멱등성 확인.

**미룬 것(문서화된 갭)**: B-2(시장 이상치)는 W7 KIS 시세 배치 의존이라 스키마만 존재하고
로직 없음. B-3(DART 실시간 공시)는 `disclosure`를 news_cluster와 별도 소스로 다루라는
설계만 있고 DDL이 없어 미구현. C층(네이버 뉴스 검색)은 크레덴셜이 없어 클라이언트 미작성.
Trends 급상승 키워드 → entity 후보 연결(docs/16 §2-B-1)은 W4/W5 개체추출·후보검색이
갖춰진 뒤에나 저장 스키마를 정할 수 있어 TrendsClient의 fetch+파싱까지만 구현하고 저장
연결은 보류.

클린 typecheck/lint/test(158개)/build/check-enum-sync/lint-forbidden-words/format:check
전부 통과.

## W4 — AI 분석 (요약 + 개체) ✅ 완료 (2026-08-21)
E2.2(T2.2.1~2.2.4). 비용 상한과 `llm_run` 기록을 **첫 호출 전에** 붙인다.
검증: 태풍/아이돌/반도체 뉴스 각 3건에서 개체 분해(E1 규칙)가 의도대로 되는지 육안 확인.
DoD(docs/14 T2.2.4): "태풍 노루" 입력 시 `노루`(WORD/TYPHOON_NAME) 개체가 나온다.

**진행 기록**: `@anthropic-ai/sdk`(최신 0.120.x — claude-api 스킬로 모델ID/단가/strict tool
use 확인 후 도입) 기반 AnthropicLlmClient(T2.2.1) 구현 — tool_choice로 도구 호출 강제 +
`strict:true`, temperature 0, JSON 파싱/스키마검증(zod) 실패 시 1회 재시도(재시도 토큰도
합산해 과금 누락 방지), llm_run 기록(input_hash 캐시 재사용 — docs/08 §7 공식 그대로
sha256(headline+summary+prompt_version)), 일일 비용 상한 초과 시 SKIPPED로 스킵(호출 전
게이트, docs/11 §4). LLM_MODEL 기본값을 존재하지 않던 모델ID(claude-sonnet-4-5)에서
docs/11 §4 "요약·개체는 저비용 모델" 원칙대로 claude-haiku-4-5로 교체.

packages/core에 순수 함수로: LLM 출력 zod 스키마(SummaryOutputSchema/
EntityExtractionOutputSchema — kind는 spec/types.ts ENTITY_KINDS 재사용), sha256
input_hash, USD 비용 계산, spec/prompts/*.md 파서(SYSTEM/TOOL SCHEMA/USER 템플릿 추출 —
실 프롬프트 파일 두 개로 직접 검증함), **원문 20자 초과 그대로 인용 금지 사후검사**
(quote-guard, PRD D5 — LLM이 프롬프트로 약속해도 강제되지 않아 R5 금지어 린터와 같은
자리에 결정론 검사를 둠), 개체 정규화(NFC+특수문자제거)·불용개체 판정까지 TDD(43개 테스트
추가, packages/core 총 167개).

apps/worker에 summarizeCluster(T2.2.2, 대표기사+lead+다른매체제목 5개 입력)·
extractEntitiesForCluster(T2.2.3+2.2.4, entity upsert는 `mention_total` 원자적 증가로
경쟁조건 회피 + `entity_stoplist`(신규 테이블, 마이그레이션 0003 — 정부/대통령실/국회/
코스피/코스닥/증권가 seed) 필터링 + graph_node(NEWS,ENTITY)/graph_edge(MENTIONS) 생성)
구현, `news.analyze` 큐(동시성4, docs/11 §1) 배선 — `news.cluster`가 신규 클러스터마다
큐잉(트리거 "④ 신규 클러스터" 그대로).

spec/prompts/summary.md 신설(entity_extraction.md만 있었음 — 같은 형식으로 작성).

**미룬 것**: canonical_id 동의어 병합(docs/08 §6-④, 예 "엔비디아"←"NVIDIA")은 신뢰할
판정을 하려면 개체별 별칭 이력 저장소가 필요한데 아직 없다 — 정확히 일치하는
(name_norm,kind) 재사용(§6-③)까지만 구현하고, 자동 병합은 W5 골든셋으로 오탐률을 잴 수
있을 때 다시 붙인다.

**검증**: ANTHROPIC_API_KEY가 없어(.env 미설정) 실 LLM 호출은 못 했지만, docs/08 few-shot
예시("태풍 '노루' 북상")를 그대로 반환하는 fake AnthropicLlmClient로
`pnpm manual-verify-analysis`가 실제 로컬 postgres에 대해 전체 파이프라인을 실행 확인:
DoD(노루=WORD/TYPHOON_NAME) 통과, entity_stoplist로 "정부" 필터링(entitiesStoplisted
카운트까지 일치), graph_edge MENTIONS 3건 생성, llm_run cost_usd 계산 정확(토큰×단가
검산), input_hash 캐시 재사용(재실행 시 llm_run 신규 행 0), 일일 비용 상한 0으로 두면
SKIPPED_COST_CAP, 원문 20자 초과 그대로 인용한 가짜 요약은 GUARDRAIL_BLOCKED로 저장
거부 — 5개 시나리오 전부 통과. 실 API 키가 있는 환경에서 AnthropicLlmClient 라이브
호출(strict tool use 스키마가 실제로 통하는지 포함) 재검증 필요.

클린 typecheck/lint/test(203개)/build/check-enum-sync/lint-forbidden-words/format:check
전부 통과.

## W5 — 연결 엔진 ✅ 완료 (2026-08-21)
E2.3 전체(반증 검사 T2.3.5 제외) + T4.1(골든셋 러너) 일부 앞당김.
검증: 골든셋 통과율 ≥ 90%, 오탐 함정 0건.
> 이 주가 끝나면 **화면 없이도 제품이 존재한다.** DB 안에 연결과 경로가 쌓인다.

**진행 기록**: packages/core에 순수 함수로 스코어링 엔진 전체(docs/10-scoring.md §2~9 공식 그대로 —
keywordMatch/marketReaction/meme/confidence/supplyChain/relevanceBand/connectionScore, §9
"골든셋 #1 노루페인트" 예시로 71점이 그대로 재현됨을 단위테스트로 고정)와 Recall 엔진(T2.3.1:
ALIAS_EXACT/PREFIX/JAMO_SIMILAR는 W2 verify-name-index.ts 로직을 정식 모듈로 승격, GRAPH_EXPAND/
THEME_DICT/SUPPLY_DICT는 재귀 CTE 결과 해석기로 통합 — 사용된 엣지 타입으로 룰을 분류)와
가드레일 G1~G9(docs/13 §2 그대로, 순수 함수 배열 + 순차 리듀서)를 구현. spec/types.ts의
`Candidate`에 `keywordMatchScore`/`isAmbiguousAlias`/`pathEdgeConfidences`/`pathEdgeWeights`를
추가해 recall 시점에 계산한 값을 스코어링 단계가 그대로 재사용하도록 함. spec/scoring.config.json에
`recall` 섹션(Recall 룰 8종 기본 recallScore·상한 40·maxHops 3·pruneWeightFloor 0.15, docs/09 §2
표 그대로) 추가 — 가중치 하드코딩 금지 원칙 유지.

apps/worker에 재귀 CTE 실행(connections/graph-search.ts, docs/11 §2-⑧ SQL 그대로 — 사이클
방지·가지치기 유지) + Recall 오케스트레이션(connections/search-candidates.ts, 별칭→그래프 1홉
확장→개념사전→그래프 확장까지 병합) + LLM 심사·가드레일·스코어링·저장 파이프라인
(connections/build-connections.ts, T2.3.4+6+7+8)을 구현하고 `connection.build` 큐를
`news.analyze`(⑥ 완료) 트리거로 배선(docs/11 §1). `emit_judgements` 도구 스키마와
`LLM_MATCH_MODEL`(기본 claude-sonnet-5 — docs/11 §4 "심사는 고성능 모델") 환경변수 추가.
graph_node upsert 로직이 extract-entities.ts/sync-affiliation-edges.ts에 중복돼 있던 것을
apps/worker/src/graph/ensure-node.ts로 통합.

**실 postgres로 잡은 실제 버그 3건** (유닛 테스트만으로는 못 잡음 — manual-verify-connections.ts로
전체 파이프라인을 실 DB에 붙여서 발견):
1. 재귀 CTE의 비재귀 항이 `numeric(4,3)`, 재귀 항의 곱셈 결과가 무제약 `numeric`이라 타입 불일치
   에러 — 비재귀 항을 `::numeric`으로 캐스팅.
2. postgres.js가 `bigint` 컬럼(id류)을 정밀도 보존을 위해 문자열로 반환하는데, 재귀 CTE 결과의
   `node_ids`/`edge_ids`/`company_id`를 숫자로 취급해 이후 `Map<number,...>` 조회가 전부 조용히
   실패(문자열 '10' ≠ 숫자 10) — 개념사전 경유 후보가 항상 0건으로 나왔다. 명시적 `Number()` 변환으로 수정.
3. 가드레일 오케스트레이터가 모든 규칙을 원본 judgement 기준으로 판정한 뒤 결과만 순서대로
   합성해서, G4가 business_relevance를 30으로 이미 내렸는데 G6이 "원래 70이었으니 위반"이라며
   59로 다시 덮어씀 — 리듀서처럼 각 규칙이 이전 규칙의 보정 결과를 보고 판단하도록 순차 적용으로
   변경(회귀 테스트 추가).

seed에 한미반도체(042700, spec/prompts/company_matching.md few-shot 예시)와 개념 사전 최소 시드
(AI가속기/HBM/반도체장비 + RELATED_CONCEPT/SUPPLY_CHAIN 엣지, 같은 few-shot 예시 재현) 추가,
SK하이닉스/한미반도체에 business_summary 시드값 추가(G6 가드레일이 근거 없음으로 오판하지
않도록 — 실제로는 T1.2.2 DART 동기화가 채울 값의 자리표시자).

manual-verify-connections.ts로 실 DB에 대해 확인: "노루"→노루페인트/노루홀딩스 recall(둘 중
SHORT 별칭 완전일치를 갖는 쪽이 ALIAS_EXACT/NAME_MATCH), AFFILIATION 1홉 GRAPH_EXPAND(3노드
경로 실제 조립), "AI 가속기"→SK하이닉스/한미반도체 SUPPLY_CHAIN(개념사전 2홉, business_relevance
75로 G6 통과), G7(재난 뉴스 MEME 하드 차단, connection 0건 + guardrail_violation 기록),
G4(BR 30 강등), input_hash 캐시 재사용 + connection upsert 멱등성 — 5개 시나리오 전부 통과.

**골든셋(T4.1 일부 앞당김)**: `spec/golden/golden_set.jsonl`을 12→17케이스로 확장하고 기존
케이스의 티커 오류를 실 seed 데이터에 맞춰 정정(G-003: 032940→240810, G-004/G-005는 실제로
SUPPLY_DICT 개념사전이 생기면서 처음으로 실동작 검증됨). `scripts/run-golden.ts`(`pnpm golden`)
구현 — ANTHROPIC_API_KEY가 있으면 실 LLM으로, 없으면 결정론적 "참조 판정기"
(scripts/lib/reference-judge.ts, recallRule→connection_type 고정 매핑)로 돌린다. 참조 판정기는
**항상 ACCEPT**하므로 "recall은 후보로 올리지만 LLM의 REJECT만이 걸러내는" 오탐 함정
(신라→신라젠, 대한민국→대한항공 같은 첫음절 공유 케이스)은 검증할 수 없다 — 그런 케이스는
`needs_llm: true`로 표시해 `NEEDS_LLM_REVIEW`로 보고하고 통과율 계산에서 제외한다(거짓 PASS를
만들지 않는 것이 거짓 FAIL을 피하는 것보다 중요하다는 판단). 이 환경(ANTHROPIC_API_KEY 없음)
결과: 15/15(100%) 통과, needs_llm 2건 보류.

클린 format-check/lint/typecheck/test(core 264개+worker 36개)/check-enum-sync/
lint-forbidden-words 전부 통과.

**미룬 것**:
- T2.3.5 반증 검사 — docs/15 원래 범위대로 이번 주는 제외. G6(사업연관성 근거 확인, BR≥60인데
  business_summary에 근거가 없으면 59로 강등)을 임시 대체 조치로 둠 — 반증 검사가 붙으면
  이 자리를 대체할 것.
- PERSON_DICT 사전 데이터 없음 — 인물→임원/최대주주 매핑(임원 데이터 자체가 아직 없음, docs/14
  backlog에도 별도 항목 없음)이 없어 코드 경로는 준비됐지만 후보가 나오지 않는다.
- THEME_DICT/SUPPLY_DICT 전체 사전(T1.2.4 테마 300개/T1.2.5 공급망 100쌍)은 여전히 미구축 —
  이번 주는 few-shot 예시 재현에 필요한 최소 3개 개념만 시드했다.
- EMBEDDING 룰은 docs/09 §2가 명시한 대로 V1.1로 미룬다(임베딩 공급자 미정, W3 기록과 동일 이유).
- T2.3.8 "캐시 무효화"(CDN 태그 purge)는 아직 CDN/웹 레이어 자체가 없어(W6+) 구현 대상이 없다 —
  connection upsert까지만 이번 주 범위.
- 골든셋은 17케이스로 확장했지만 목표 40케이스에는 못 미친다. 특히 오탐 함정(가장 중요한
  카테고리)은 실 LLM 없이는 참조 판정기로 검증되지 않는 case가 있다 — ANTHROPIC_API_KEY가 있는
  환경에서 `pnpm golden` 재실행으로 needs_llm 케이스들이 실제로 REJECT되는지 확인 필요.
- 실 API 키가 있는 환경에서 company matching LLM 호출(strict tool use로 emit_judgements가
  실제로 통하는지 포함) 라이브 재검증 필요 — W2~W4와 같은 패턴의 남은 숙제.

## W6 — 화면 (홈 · 뉴스 · 그래프)
E3.1 + T3.2.1~3.2.3.
그래프를 이 주에 반드시 만든다. 뒤로 미루면 "목록 앱"으로 굳어지고 다시는 안 만들게 된다.
검증: 모바일 실기기에서 그래프를 손으로 만져본다.

## W7 — 나머지 화면 + 시세 + 발견
E1.3 + T3.2.4~3.2.7 + E4.1(골든셋 CI).
검증: 종목 상세 역방향에서 "연결 미발견"이 정직하게 뜨는지 확인.

## W8 — 알림 · 검수 · 출시
E3.3 + T4.2 + E5.
검증: 스스로 키워드 3개 걸고 하루 써본다. 알림이 성가시면 사용자에게도 성가시다.

---
## 주차별 게이트 (통과 못 하면 다음 주로 넘어가지 않는다)
| 주 | 게이트 |
|---|---|
| W2 | 스크립트로 `노루`→노루페인트 후보가 나온다 |
| W3 | 기사:클러스터 압축률 ≥ 10:1 |
| W4 | 일일 LLM 비용이 상한 내에서 예측 가능하다 |
| W5 | 골든셋 통과율 ≥ 90%, 오탐 함정 0 |
| W6 | 실기기에서 그래프가 부드럽다 |
| W8 | 하루 종일 무인 운영으로 파이프라인이 돈다 |

## 출시 후 첫 4주
| 주 | 할 일 |
|---|---|
| +1 | 매일 아침 연결 30건 육안 검수. 이상한 건 골든셋에 추가 |
| +2 | 반증 검사(T2.3.5) 투입, BR 고득점 정확도 개선 |
| +3 | 피드백 데이터로 가중치 튜닝 (rescore만, LLM 재호출 없음) |
| +4 | 유료화 법률 검토 착수 + 과거 유사 사례 기능 |

## 하지 말아야 할 유혹
- 1주차에 디자인 시스템 완성하기 → 화면은 W6에 시작한다
- 그래프를 "나중에" 미루기 → 이 제품의 정체성이다
- LLM에게 후보 검색까지 맡기기 → R1 위반. 편해 보이지만 서비스가 죽는다
- 골든셋 없이 프롬프트 튜닝 → 좋아졌는지 나빠졌는지 영원히 모른다
- 유료화 먼저 붙이기 → 법적 검토 전에 과금하면 되돌릴 수 없다
