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

## W6 — 화면 (홈 · 뉴스 · 그래프) ✅ 완료 (2026-08-21)
화면 디자인은 '17-screen-design-guide.md' 파일 컨셉을 참고한다.
E3.1 + T3.2.1~3.2.3.
**그래프를 이 주에 반드시 만든다. 뒤로 미루면 "목록 앱"으로 굳어지고 다시는 안 만들게 된다.**
검증: 모바일 실기기에서 그래프를 손으로 만져본다.

**진행 기록 (1차 — T3.1.1/T3.1.3 기반 + T3.2.1 홈 완료, T3.2.2/T3.2.3은 다음 스텝)**:

`apps/web/lib/fonts.ts`에 `next/font/google`로 Noto Serif KR/Noto Sans KR/JetBrains Mono
셀프호스팅(docs/17 서체 표 그대로) + `globals.css`에 디자인 토큰을 CSS 변수(oklch)로,
`tailwind.config.ts`에 `paper/ink/up/down/rule` 등으로 매핑. 마스트헤드(`components/layout/
masthead.tsx`)와 고지문구(`components/ui/disclaimer-block.tsx`)는 doc17 "모든 화면 공통 유지"
규칙대로 root layout(`app/layout.tsx`)에 둬서 다음 화면(뉴스 상세 등)에도 그대로 적용된다.
하단 탭 4개(T3.1.1 DoD, docs/03-ia.md §2)는 `components/layout/bottom-nav.tsx`
(모바일 고정)+`MastheadNav`(데스크톱 인라인)로 구현 — 발견/검색/알림은 W7/W8 라우트라
`ready:false`로 비활성 처리(`lib/nav.ts`, dangling 링크 금지). 공통 컴포넌트(T3.1.3 일부):
`ConnectionTypeBadge`(spec `CONNECTION_KIND_META` 재사용)·`ScoreGauge`(R4 — 연결강도/밈력을
색이 다른 별개 게이지 2개로, 절대 합산 안 함)·`RelevanceBandBadge`.

T3.1.2(API 클라이언트)는 원안(openapi-typescript 코드생성)이 아니라 `spec/types.ts`의 DTO를
Next.js Route Handler(BFF, docs/07-api-spec.md §1)에서 직접 import해 조립하는 방식으로
단순화 — 별도 코드생성 파이프라인 없이 스펙과 타입이 항상 일치한다. `apps/web/lib/api/
mappers.ts`(DB 행→DTO 순수 함수, 유닛테스트 10건)와 `queries.ts`(drizzle 조회 오케스트레이션,
`getHomeData` — PENDING/REJECTED 연결은 검수 대기·탈락이라 공개 화면에서 제외하고
ACTIVE/DISPUTED/CORRECTED만 노출, docs/13-validation.md 기준)로 분리해 `GET /v1/home`
라우트(`app/api/v1/home/route.ts`, docs/07 §2 캐시 헤더 `s-maxage=60, SWR=300`)를 구현하고,
홈 페이지(`app/page.tsx`)는 같은 함수를 서버 컴포넌트에서 직접 호출한다(BFF가 스스로를
호출하는 불필요한 라운드트립 없음).

**S1 홈 5블록**(`components/home/*`) 구현 후 실 로컬 postgres(W3~W5 검증 과정에서 쌓인
실데이터 — news_cluster 52건, connection 25건)에 붙여 Playwright로 데스크톱(1280px)·
모바일(390px) 스크린샷과 콘솔 에러를 직접 확인(`make run`/`pnpm dev` 스킬 부재 확인 후
`chromium-cli` 미설치라 로컬 캐시된 Playwright chromium으로 대체 검증). 그 과정에서 실제
버그 2건을 잡음:
1. 리드 문단 드롭캡(docs/17 토큰: `3.4em`/`900`)이 라틴 문자 기준이라 한글 완성형 글자
   1개에 그대로 적용하니 획이 뭉개진 검은 사각형처럼 보임 — `2.6em`/`700`으로 조정
   (`app/globals.css` `.lead-para:first-letter`).
2. `analysisStatus !== 'DONE'`이면 무조건 "AI 분석 중" 배지를 띄웠는데, 실데이터에 있는
   `FAILED` 상태 클러스터에도 "분석 중"이라고 표시돼 사실과 다름(분석은 이미 실패해
   끝났다) — `PENDING`/`RUNNING`일 때만 배지를 띄우고, 그 외(FAILED 포함)는 연결이
   없을 때와 동일하게 "설명 가능한 연결을 찾지 못했습니다"로 처리(`components/home/
   news-cluster-card.tsx`).

**스펙 충돌 2건을 발견해 판단 근거를 남긴다** (둘 다 doc05/openapi를 우선함 — CLAUDE.md
"spec이 단일 진실 원천, docs는 설명"):
- 관련기업 칩 색: docs/05-screen-specs.md S1은 "business_relevance 3단계(초록/파랑/회색)"로
  정의하는데 docs/17 컴포넌트 패턴은 "상승/하락 색상(빨강/파랑)"이라고 적혀 있어 서로 다른
  신호를 인코딩한다. R4(연관성과 밈력을 합치지 않는다)에 더 가까운 doc05 규칙을 따름
  (`lib/format/tone.ts` `companyChipTone`).
- 필수 고지문구: docs/17이 적은 문구와 docs/01-prd.md §7 D3(법적 경계 원본)의 문구가
  토씨가 다름 — 법적 문구는 D3가 단일 진실 원천이라 그쪽을 그대로 씀
  (`components/ui/disclaimer-block.tsx`). D3 문구로 `/legal/disclaimer` 페이지도 신설(고지
  블록의 "자세히" 링크가 걸릴 곳이 없으면 안 되므로).

**docs/17 자체의 결함도 하나 발견**: "원본 소스(.dc.html)는 이 프로젝트에
`design/main-desktop.dc.html`, `design/main-mobile.dc.html`로 함께 올려둠"이라고 적혀 있지만
실제로는 저장소 어디에도 없고(`git log --all`에도 없음) 캔버스 링크(`.../artifact/
6e838ab8-...`)도 이 계정의 Artifact 목록에 없다(WebFetch: "artifact not found") — 문서만 남고
실물 소스가 사라진 상태로 보인다. 이번 주는 doc17의 토큰/레이아웃 규칙 표만으로 화면을
재구성했고, doc17 자체 수정(파일 참조 제거 또는 소스 복구)은 다음 스텝으로 남긴다.

**카테고리 탭 / 검색 / 정렬 / 스크랩을 이번 주에 넣지 않은 이유**: docs/17 프로토타입에는
있지만 `spec/types.ts`(`NewsClusterDto`에 category 필드 없음)와 `spec/openapi.yaml`(`/v1/news`에
category 파라미터 없음, 별도 `/v1/search`는 W7 T3.2.6)에 대응하는 데이터/계약이 없다.
company.sector 문자열로 카테고리를 억지로 추정하면(예: "화학"→"2차전지") 잘못 분류될 수 있어
R1 정신에 어긋난다고 판단해 보류 — 실 taxonomy 필드가 생기기 전엔 만들지 않는다. 스크랩은
로그인/저장 기능(T3.3, W8)에 의존한다.

**진행 기록 (2차 — T3.2.2 뉴스 상세 + T3.2.3 연결 그래프, 그래프 게이트 통과)**:

**뉴스 상세(S2)** `/news/[clusterId]`: 헤더(뒤로가기+HEAT+헤드라인+원문 링크+매체 아코디언,
`components/news/news-detail-header.tsx`) → AI 3줄 요약 → 핵심 개체 칩 → ConnectionGraph →
연결 종목 리스트(사업 연관만/밈 포함 토글, `components/news/connection-list-section.tsx`) 순서로
doc05 §S2 그대로 구현. `analysis_status`가 PENDING/RUNNING이면 4~6은 스켈레톤만 보여주고
`AnalysisPendingPoller`(클라이언트 컴포넌트, `fetch`+`router.refresh()`)가 5초마다
`GET /api/v1/news/{id}`를 확인해 DONE/FAILED로 바뀌면 자동 새로고침한다. FAILED 클러스터는
"AI 분석 중"이라고 거짓말하지 않고(1차 진행 기록에서 잡은 버그와 같은 원칙) 곧바로 "설명 가능한
연결을 찾지 못했습니다"로 처리. 클러스터를 못 찾으면 `notFound()` + 신문 톤으로 스타일링한
`app/not-found.tsx`(Next 기본 영어 404 대신).

**연결 그래프(S3, 이 주의 핵심 게이트)** — `GET /v1/news/{id}/graph`는 그래프를 다시 탐색하지
않고 **그 클러스터의 connection.path들을 그대로 합쳐서** 만든다(`lib/api/graph.ts`
`buildClusterGraph`, 순수 함수 + 유닛테스트 10개) — 별도 그래프 워크가 아니라 "실제로 연결을
찾는 데 쓰인 근거만 보여준다"는 R2/R3 원칙과 정확히 맞는 설계다. 뉴스 노드는 실 DB에
`graph_node(kind=NEWS)`가 아직 하나도 없어서(W4에서 코드는 만들었지만 이 환경엔
ANTHROPIC_API_KEY가 없어 그 경로가 한 번도 안 돌았다 — `psql`로 직접 확인) 매 요청마다
음수 id로 합성한다. 엣지의 실제 weight/confidence/evidence는 `connection.path`엔 없어서
`graph_edge` 테이블에서 (src,dst,type) 3중 매칭으로 조회해 채운다(`edgeFactsForPaths`) —
실 DB 값(예: HBM→SK하이닉스 SUPPLY_CHAIN weight 0.85)이 그대로 API 응답에 나오는 것까지
확인함. 레이아웃은 `lib/graph/layout.ts`(`d3-force`로 레인 안 세로 배치만 계산, 애니메이션
루프 없이 고정 200틱만 미리 계산 — `prefers-reduced-motion`이면 시뮬레이션 자체를 안 돌리고
균등 배치, 유닛테스트 5개)이 담당하고, `components/graph/connection-graph.tsx`(클라이언트
컴포넌트)가 SVG로 그린다: 노드 모양(뉴스=둥근사각/개체=원/개념=마름모/기업=사각+티커),
엣지 색=타입별·굵기=weight·evidence 없으면 점선(`lib/graph/style.ts`), 포인터 이벤트로
팬/휠 줌/2손가락 핀치 줌/더블클릭 리셋, 노드 탭 시 하이라이트(`lib/graph/highlight.ts`,
유닛테스트), 엣지 탭 시 근거 팝오버(라벨+출처 링크+확신도), 기업 노드 탭 시 간단 패널(전체
종목 카드는 W7), `<details>` 텍스트 폴백(`graph.textPaths`, 스크린리더/SEO/공유 대비 상시
DOM에 존재). "핵심 개체 칩"과 그래프의 하이라이트 상태는 `news-detail-graph-section.tsx`가
공유(칩 클릭 → 그래프 노드 선택, label 문자열로 매칭 — entity.id와 그래프 노드 id가 서로 다른
공간이라 정확한 FK가 없어 이 방식으로 근사).

**실 브라우저 검증(Playwright, 실 로컬 postgres)에서 진짜 버그 2건을 더 잡음** — 유닛테스트만
으로는 못 봤던 것들:
1. `connection.path`의 CONCEPT_MATCH 스텝(개념 사전 매칭)은 `graph_edge`로 존재하지 않는
   룰 기반 연결이라 `edgeType` 필드 자체가 없다 — 처음 구현은 `edgeType`이 없으면 그 구간을
   그냥 건너뛰어서, 개체 노드가 그래프에서 나머지 경로와 뚝 끊긴 채 떠 있었다(스크린샷으로
   실제 확인). `edgeType`이 없으면 `RELATED_CONCEPT`로 근사해 선을 잇도록 수정
   (`lib/api/graph.ts`) — "끊어 보여주면 왜 발견됐는지가 끊긴 것처럼 보여 R2를 어긴다"는
   판단.
2. 노드 하이라이트를 무방향 BFS로 구현했더니, 개체 하나가 회사 여러 개로 갈라지는 허브
   구조(예: "원익홀딩스" 개체 → 원익홀딩스/노루홀딩스/원익IPS 3개 회사)에서 회사 하나만
   골라도 형제 가지(다른 두 회사)까지 전부 하이라이트됐다 — 스크린샷으로 직접 클릭해서 발견.
   조상(들어오는 방향)/자손(나가는 방향)을 구분한 방향성 BFS로 교체(`lib/graph/highlight.ts`)
   해서 말단 노드를 고르면 그 노드로 가는 경로만, 허브 노드를 고르면 갈라지는 모든 가지가
   잡히도록 수정 — 회귀 테스트 2건 추가.

**미룬 것**:
- T3.2.7(피드백 위젯, 👍이해됐어요/🤔억지스러워요) — doc05 S2 화면 설명엔 있지만 백로그
  태스크 자체가 W7 범위(docs/14 §S3.2)라 이번 주에 손대지 않음. `connection_feedback` 테이블
  (anon_id 유니크 제약)은 이미 있으니 W7에서 바로 붙일 수 있다.
- 기업 노드 탭의 "하단 시트 종목 카드"는 이름/티커만 보여주는 최소 패널로 대체 — 전체 S4
  종목 상세는 W7(T3.2.4)에서 만든다.
- 핀치 줌은 2손가락 터치 이벤트로 구현했지만 실기기(모바일 크롬/사파리)에서 직접 만져보진
  못했다(이 환경엔 실물 터치 디바이스가 없음) — docs/15 W6 게이트("모바일 실기기에서 그래프를
  손으로 만져본다")는 데스크톱 Playwright로 팬/줌/탭 상호작용까지는 확인했지만 실기기 검증은
  아직 남아 있다.
- MoverNewsBlock은 `market_snapshot`이 아직 비어 있어(W7 KIS 배치 의존, 기존에 알려진 갭)
  항상 빈 상태로 렌더된다 — 쿼리(`getMovers`)는 구현해뒀으니 W7에서 시세가 들어오면 바로
  동작한다.
- "지금 뜨는 검색어"/"공시속보" 사이드바(doc17 컴포넌트 패턴)는 만들지 않음 — 전자는 대응
  데이터가 없고(Trends 저장 연결은 W3에서 이미 보류됨), 후자는 `disclosure` 스키마 자체가
  없다(W3 기록과 동일한 갭).
- 카테고리 탭/검색창/스크랩 — spec에 대응 데이터·계약이 없어 보류(위 1차 기록 참고).
- 폰트 네트워크: 이번 세션의 샌드박스에서는 `next/font/google`이 재시도 끝에 성공했다(이전
  W1/W2에서 KRX/DART가 막혔던 것과 다른 결과 — 아마 CDN 캐시 차이). 실 배포 환경에서
  빌드가 안정적으로 되는지는 별도 확인 필요.
- 그래프 노드 `refId`(ENTITY/CONCEPT 종류)는 `connection.path`에 entity.id/concept.id가 없어
  그래프 노드 id로 근사했다 — 지금은 아무도 참조하지 않지만, V1.1 `/entity/[entityId]` 허브가
  생기면 정확히 채워야 한다(`lib/api/graph.ts` 주석에 남겨둠).

**검증**: `pnpm --filter @gukjang/web test`(38개, `lib/format/*`+`lib/api/{mappers,graph}.ts`+
`lib/graph/{layout,highlight}.ts` 순수 함수 대상) + 루트 `make ci` 동일 게이트(format-check/
lint/typecheck/test 320개/check-enum-sync/lint-forbidden-words) 클린 통과 + `next build`
프로덕션 빌드 성공(뉴스 상세 라우트 First Load JS 123kB) + 실 로컬 postgres(뉴스 클러스터
52건·연결 25건)에 대해 Playwright로 데스크톱(1280px)/모바일(390px) 스크린샷 + 노드/엣지 클릭
상호작용까지 실제 실행해 확인, `console --errors` 0건, `GET /v1/news/{id}/graph` 응답의
weight/confidence/evidence가 실 `graph_edge` 값과 일치 확인, FAILED/빈 연결 클러스터와
404(없는 클러스터id) 모두 정직하게 처리되는 것 스크린샷으로 확인.

## W7 — 나머지 화면 + 시세 + 발견 ✅ 완료 (2026-08-21)
화면 디자인은 '17-screen-design-guide.md' 파일 컨셉을 참고한다.
E1.3 + T3.2.4~3.2.7 + E4.1(골든셋 CI).
검증: 종목 상세 역방향에서 "연결 미발견"이 정직하게 뜨는지 확인.

**진행 기록**: docs/04-mvp-features.md 등급표를 다시 확인해 우선순위를 잡았다 — C11(피드백)이
백로그 태스크 순서상 T3.2.7로 뒤에 있지만 실제 등급은 **M(Must)**이라 스크린 작업들과 같이
묶어 처리했고, C9(개체 허브)·C12(북마크)는 S(V1.1)라 그대로 보류했다.

**T3.2.4 종목 상세(S4)** `/stock/[ticker]`: 헤더(가격/등락/거래량/스파크라인, 시세 없으면
정직하게 "아직 집계된 시세가 없습니다") → 오늘의 연결(카드 선택형) → 왜 발견됐나요(세로
경로 스텝) → 실제 사업 연관성(3단계+counterEvidence) → 강조 고지 박스. `getConnectionsForStock`
(`lib/api/queries.ts`)는 역방향 조회이며 연결이 없으면 그대로 빈 배열을 반환한다(R1) — 이
주의 게이트(005930 삼성전자로 "연결 미발견" 확인)를 스크린샷으로 검증함. `CompanyChip`에
`linkToStock` 옵션을 추가해 홈/뉴스 상세/무버 블록에서 종목 상세로 이어지도록 함(단, 이미
카드 전체가 `<Link>`인 곳에는 앵커 중첩을 피해 링크를 안 켬).

**T3.2.7 피드백 위젯(C11, Must)**: `connection_feedback` 테이블(anon_id 유니크 제약, 스키마는
이미 있었음)에 `POST /v1/connections/{id}/feedback`으로 익명 1인 1회 저장. 클라이언트
anonId는 `lib/anon-id.ts`(localStorage, 순수 함수로 분리해 유닛테스트 3건)로 관리하고,
`components/news/feedback-buttons.tsx`가 뉴스 상세의 연결 리스트 각 행에 👍/🤔 버튼을 단다
(S2 §7 문구 그대로).

**T3.2.5 발견(S5)** `/discovery`: 오늘의 억지 관련주 TOP10 + 이번 주 명예의 전당(회사당
최고 memeScore 1건만, `getWeeklyMemeHallOfFame`) + 키워드 제보(`POST /v1/discovery/requests`,
PRD D2 — 1:1 응답 없이 공개 큐에만 등록). 공유 버튼(`ShareButton`, OG 이미지 링크 + 클립보드
복사)을 `MemeRankBlock`에 `showShare` 옵션으로 추가해 홈/발견 양쪽에서 재사용.

**공유 카드 OG 이미지(C6)** `GET /api/og/connection/{id}`: `next/og`의 `ImageResponse` 사용 —
스펙(docs/07 §8)은 edge runtime을 권장하지만 이 프로젝트는 Route Handler가 postgres.js로
DB를 직접 쿼리하는 BFF 구조라(docs/07 §1) edge에서 Node 소켓 기반 DB 클라이언트가 못 돌아
`nodejs` 런타임으로 뒀다. satori(ImageResponse 렌더러)는 `oklch()`를 모르는 별도 렌더
엔진이라 종이색 토큰을 hex로 근사했고, 한글 글리프가 기본 서체에 없어 Google Fonts CSS의
`text=` 서브셋 파라미터로 필요한 글자만 받아오는 헬퍼(`lib/og-font.ts`)를 만들었다 — 실제
PNG로 렌더해 한글이 정상 출력되는 것까지 확인(`/tmp/og-test.png`).

**T3.2.6 검색(S6)** `/search`: 단일 입력(300ms 디바운스) + 전체/뉴스/기업/키워드 4탭, 최근
검색어 localStorage 저장. 기업 검색은 `company.name_norm`/`ticker`/`company_alias.alias_norm`
ILIKE(이미 있는 trigram 인덱스를 그대로 탄다). **0건일 때의 유사 개체 제안은 W2에서 만든
`recallByAlias`(자모 유사도 엔진)를 그대로 재사용** — "원희" 검색 시 "원익IPS"/"원익홀딩스"를
제안하는 것까지 실제로 재현해 확인(정확히 docs/09 §2·W2 게이트 예시와 같은 케이스).

**A5 시세(T1.3.1~1.3.3, Must)**: KIS_APP_KEY/SECRET이 이 환경엔 없어(DartClient·KrxListingClient
와 같은 처지) 라이브 검증은 못 했지만, 코드는 같은 원칙(fake client + 실 로컬 postgres)으로
전부 확인했다.
- `packages/core/src/kis/`: `market-status.ts`(장전/장중/장후/휴장 판별, 순수 함수, 유닛테스트
  6건), `volume-ratio.ts`(20일 평균 대비 배수, 유닛테스트 4건 — KIS 단건 조회엔 20일 평균이
  없어 우리 DB에 쌓인 과거 스냅샷으로 직접 계산), `map-snapshot.ts`(KIS 응답 문자열 필드 →
  숫자, `prdy_vrss_sign` 부호 보정, 유닛테스트 4건), `holidays.ts`(2026 KRX 휴장일 — **양력
  고정 공휴일만** 채움, 대체공휴일은 실제 요일을 `python`으로 계산해 검증함(3/1·8/15·10/3이
  토·일이라 대체공휴일 발생 확인). 설날/추석 등 음력 공휴일은 실 데이터 없이는 확정할 수
  없어 일부러 비워두고 "불완전한 placeholder"라고 명시함 — 틀린 날짜를 넣는 것보다 빈 게
  낫다는 판단).
- `apps/worker/src/collectors/kis-client.ts`: OAuth2 토큰 캐싱(만료 5분 전 자동 갱신, 매 호출
  재발급으로 KIS 발급 레이트리밋에 걸리지 않게), 재시도, 유닛테스트 4건(가짜 fetch로 토큰→
  시세 조회 순서·토큰 재사용 확인).
- `apps/worker/src/collectors/sync-market-snapshot.ts`: 5분 배치, `getMarketStatus`가 OPEN이
  아니면 전체 스킵(장중에만 KIS를 호출). `pnpm manual-verify-market-snapshot`으로 실 로컬
  postgres에 대해 확인: OPEN 시각엔 스냅샷 upsert(재실행 시 `updated:0`으로 멱등성 확인),
  CLOSED 시각(주말)엔 완전히 no-op. 이 스냅샷이 실제로 Home의 MoverNewsBlock과 종목 상세
  헤더에 그대로 흘러가는 것까지 스크린샷으로 확인(W6에서 "아직 집계된 시세가 없습니다"였던
  자리가 실제 가격/등락률/거래량으로 채워짐).
- **미룬 것**: docs/11 §⑪ "5분 배치로 connection.score 재실행(시장 반응 점수만 갱신)"은
  스냅샷을 만드는 쪽(T1.3.2)만 구현했고, 그걸 트리거로 기존 connection을 재점수화하는
  BullMQ 잡 배선은 안 함 — 별도 큐 타입이 필요해 범위를 넘어간다고 판단, 다음 스텝 후보로
  남김. cron 배선(`pipeline-scheduler.service.ts`에 등록)도 아직 안 함(수동/배치 스크립트
  단계).

**E4.1 골든셋 CI 연동**: `.github/workflows/golden.yml` 신설 — PR마다 postgres 서비스
컨테이너(`pgvector/pgvector:pg16`, docker-compose.yml과 동일 이미지)를 띄우고 migrate→seed→
`make golden`을 돌려 결과를 PR 코멘트로 남긴다(기존 코멘트가 있으면 갱신). 기본 `ci.yml`은
"실 DB에 연결하지 않는다"는 원칙을 지키려 의도적으로 분리해 뒀었는데(ci.yml 자체 주석)
그 분리 의도를 그대로 따라 별도 워크플로로 둠. `make golden` 타깃을 Makefile에 새로
추가(기존엔 `pnpm golden`만 있고 로컬/CI가 같은 Makefile 타깃을 쓴다는 프로젝트 원칙에서
빠져 있었음).

**⚠️ 이 검증 과정에서 실 API 키로 처음 라이브 확인하다가 W4/W5부터 이어진 "실 API 키
환경에서 재검증 필요" 숙제 두 개를 실제로 발견하고 고쳤다** (docs/17 이번 세션 이전엔 이
환경에 `ANTHROPIC_API_KEY`가 없었는데, 이번에 처음으로 실제 키가 있는 것을 확인함):
1. **strict tool use가 JSON Schema `minimum`/`maximum`/`maxLength`/`minItems`/`maxItems`를
   지원하지 않는다** — `emit_judgements`/`emit_entities`/`emit_summary` 세 도구 스키마
   전부 이 키워드들을 쓰고 있어서 실 API 호출이 **100% 400 에러**로 실패하고 있었다(빈
   `llm_run` 오류 기록으로 확인). W4/W5는 fake client로만 검증해서 이 버그가 3주간 숨어
   있었다. `apps/worker/src/llm/tool-schemas.ts`와 `spec/prompts/*.md`의 TOOL SCHEMA
   블록에서 제약 키워드를 전부 제거하고(이미 있는 zod 사후 검증이 실제 강제 지점이므로
   안전그물은 그대로 유지됨) 값 범위는 `description`으로만 남겼다.
2. **`temperature` 파라미터가 현재 모델 세대(Sonnet 5 등)에서 400을 반환한다**(제거된
   파라미터) — `anthropic-client.ts`가 "재시도를 결정론적으로 만들려고" `temperature: 0`을
   항상 보내고 있었는데, 이것도 모든 실 호출을 실패시키고 있었다. 파라미터 자체를 뺐다
   (`tool_choice`로 도구 하나를 강제하는 구조 자체가 이미 출력을 크게 제약하므로 온도 없이도
   충분).
   두 버그 다 고친 뒤 `pnpm golden`을 실 LLM으로 다시 돌려 **9/17(52.9%) → 13/17(76.5%)**로
   즉시 확인(회귀 테스트: `anthropic-client.test.ts`에 `temperature` 미전송 검증 추가).
   실제 API 비용은 8건 성공 호출 기준 $0.09 — 무시할 만한 수준.

**남은 골든셋 4건도 이어서 마저 고쳐 최종 17/17(100%)로 마감했다** — 원래는 "다음 스텝"으로
남기려 했으나, 원인이 파이프라인 버그가 아니라 프롬프트 서술 문제로 좁혀져서 같은 세션에서
끝까지 밀어붙였다. 세 갈래였다:
1. **G-007/G-008/G-009**: `connection_type`이 골든셋 기대(SUPPLY_CHAIN/NAME_MATCH) 대신
   DIRECT로 나옴 — 조사해 보니 실 LLM 쪽이 **더 정확했다**. 세 헤드라인 전부 "그 회사 자신에
   대한 기사"인데(SK하이닉스가 자기 HBM4 양산을 발표, 원익홀딩스/에코프로비엠이 자사 실적을
   발표), 골든셋은 recall이 후보를 찾은 **룰 이름**(SUPPLY_DICT/ALIAS_EXACT)을 그대로
   `expect_type`에 옮겨 적어놨었다 — docs/09 §1 "recall과 판정은 별개, LLM은 recall 룰을
   베끼지 않고 독립적으로 판정한다"는 설계 원칙과 정면으로 어긋나는 실수였다. `spec/golden/
   golden_set.jsonl`의 세 케이스를 DIRECT로 정정(recall 룰과 최종 유형이 다를 수 있다는 이유를
   note에 남김).
2. **G-003**(원희→원익IPS/원익홀딩스, MEME 기대)은 실 LLM이 `verdict:REJECT`로 완전히
   기각해버려 연결 자체가 안 만들어졌다 — 프롬프트 규칙 #3("설명 못 하면 REJECT")과 결정
   트리의 MEME 분기가 충돌해서, "사업 연관이 없다"는 이유로 REJECT를 택하고 있었다.
   `company_matching.md`에 "REJECT는 표기·발음 접점 자체가 없을 때만" 명확히 하고 few-shot을
   추가해 고쳤다.
3. 그런데 이 수정이 **인접 케이스를 두 번 연달아 깨뜨렸다**(G-002가 NAME_MATCH→MEME으로,
   G-101/102 오탐 함정이 다시 통과로 바뀜) — "표기가 조금이라도 겹치면 MEME"으로 과교정된
   것. 최종적으로는 후보의 `recall_rule`(이미 프롬프트에 주던 정보)을 판단 신호로 명시했다:
   `ALIAS_EXACT`(정확한 별칭 일치)인데 사업 연관이 없으면 `NAME_MATCH`, `ALIAS_PREFIX`/
   `ALIAS_JAMO_SIMILAR`(부분·발음 유사)인데 겹치는 부분이 구체적 고유명사(동물·태풍·사람
   이름)면 `MEME`, 겹치는 부분이 국가명·왕조명 같은 범용 단어(신라, 대한민국)면 recall_rule과
   무관하게 `REJECT` — 이 세 갈래로 나누자 4개 케이스가 동시에 안정적으로 통과했다
   (`company_matching.md` cm-v1→cm-v4, `input_hash`가 `prompt_version`을 포함하므로 버전을
   올려야 캐시가 무효화된다는 것도 이 과정에서 직접 확인함 — 안 올렸으면 프롬프트를 고쳐도
   캐시된 옛 판정이 계속 나왔을 것).

**교훈**: 이런 종류의 프롬프트 튜닝은 진짜로 whack-a-mole이다 — 한 케이스를 고치면 인접
케이스가 깨지는 걸 이번 세션에서 두 번 직접 겪었다. `recall_rule`처럼 이미 모델에게 주고
있던 구조적 정보를 판단 기준으로 명시하는 게, "구체적/범용" 같은 모호한 형용사보다 훨씬
안정적이었다 — 앞으로 이 프롬프트를 더 튜닝할 때는 형용사 기반 규칙보다 구조적 신호(recall_rule,
path 길이 등) 기반 규칙을 우선하는 게 나아 보인다. `golden.yml`은 이제 실제로 95% 기준을
통과하는 상태에서 PR 코멘트가 돌 것이다.

**실수 기록(정직하게 남김)**: `golden.yml`을 검증하려고 로컬 DB를 `make db-reset`으로
초기화했는데, 이 환경의 실제 postgres가 `docker-compose.yml`이 관리하는 인스턴스가 아니라
포트만 5433인 별도 로컬 설치본이었고 앱 DB 유저(`gukjang`)가 여기선 superuser가 아니라
`vector` 익스텐션 재생성이 막혀 스키마가 반쯤 빈 상태로 남았다 — OS 계정과 이름이 같은
`misolkim` 슈퍼유저 role로 익스텐션을 다시 만들고 스키마 소유권을 gukjang에게 되돌려
복구했다(`make db-migrate && make db-seed`로 정상 확인). 실 인프라가 docker-compose와
다르다는 걸 미리 확인 안 하고 리셋 명령을 돌린 게 원인 — 다음에 이 종류의 초기화가
필요하면 먼저 `\dn+`/`pg_roles`로 실제 권한 구조를 확인할 것.

**검증**: `make ci` 전체(format-check/lint/typecheck/test 361개/check-enum-sync/
lint-forbidden-words) 클린 통과, `next build` 프로덕션 빌드 성공(17개 라우트), 실 로컬
postgres + Playwright로 종목 상세(시세 있음/없음 둘 다)·발견·검색(정상/0건 제안)·OG 이미지
PNG 렌더까지 스크린샷 확인, 콘솔 에러 0건. `pnpm golden`을 실 `ANTHROPIC_API_KEY`로 여러 차례
실행해 LLM 파이프라인이 진짜로 살아있는 것 자체를 이번에 처음 확인했고, 최종적으로
**17/17(100%) 통과**로 마감(실 API 누적 비용 $0.39 — 무시할 만한 수준). `golden.yml`은
지금 상태 그대로 머지해도 통과할 것이다.

## W8 — 알림 · 검수 · 출시 🔶 코드 완료, 배포·계정 연동 남음 (2026-08-21)
E3.3 + T4.2 + E5.
검증: 스스로 키워드 3개 걸고 하루 써본다. 알림이 성가시면 사용자에게도 성가시다.

**진행 기록**: 이번 세션은 E3.3(T3.3.1~3.3.4, 로그인→키워드→웹푸시→발송)까지 완료했다.
T4.2(관리자 검수 큐)·E5(출시 준비)는 아직 손 안 댐 — 아래 "다음 스텝" 참고.

**T3.3.1 소셜 로그인 + JWT 세션**: docs/07 §5 그대로 — 카카오/구글 OAuth2 Authorization
Code 플로우 → access(15분)/refresh(30일) JWT를 httpOnly 쿠키로 발급. `jose`를 새 의존성으로
추가(`apps/web`) — Edge 런타임에서도 도는 라이브러리라 Route Handler와 궁합이 좋다는 이유로
선택. 리프레시 토큰은 별도 DB 테이블 없이 `type:'refresh'` 클레임을 가진 JWT로만 구현했다 —
스키마에 세션 테이블이 없는데 이번 주에 새로 추가할 이유가 없다고 판단(무효화가 필요해지면
그때 테이블을 추가하면 된다).
- `apps/web/lib/auth/jwt.ts`: access/refresh 발급·검증, 타입 혼용(refresh를 access로 검증)
  방지. 유닛테스트 4건(정상 발급·검증, 타입 혼용 거부, 위조 토큰 거부, 쓰레기 입력에 예외
  대신 null).
- `apps/web/lib/auth/session.ts`: httpOnly 쿠키 발급/삭제/조회. Server Component 렌더링
  중에는 쿠키를 `set()`할 수 없다는 Next.js 제약 때문에 Route Handler 전용으로 문서화함.
- `apps/web/lib/auth/oauth.ts`: 카카오/구글 각각의 authorize URL 생성 + 코드 교환 + 프로필
  조회. **KAKAO_CLIENT_ID/GOOGLE_CLIENT_ID가 이 환경엔 없어(개발자 콘솔에 앱을 등록해야
  나오는 값) 실 OAuth 왕복은 검증 못 함** — KIS/DART 때와 같은 처지. 대신 `/api/v1/auth/
  {provider}`가 카카오 동의 화면으로 정확한 파라미터(client_id/redirect_uri/state)로
  리다이렉트하는 것, CSRF state 쿠키가 실제로 설정·대조되는 것(불일치 시 400)까지는 실 로컬
  서버로 확인함.
- `apps/web/lib/auth/state.ts`: OAuth CSRF state — 짧게 사는 httpOnly 쿠키, 콜백에서 1회
  대조 후 즉시 삭제(재사용 방지).
- `spec/openapi.yaml`에 `/v1/auth/{provider}`, `/v1/auth/{provider}/callback`,
  `/v1/auth/refresh`, `/v1/auth/me`, `/v1/auth/logout` 5개 경로 + `AppUser` 스키마를 새로
  추가함 — 이전엔 `bearerAuth` 시큐리티 스킴만 있고 실제로 그 토큰을 발급하는 엔드포인트가
  계약에 없는 구멍이었다. `spec/types.ts`에도 `AppUserDto`/`AlertKeywordDto`/
  `AlertKeywordInput`/`PLAN_KINDS`/`OAUTH_PROVIDERS`를 추가(둘 다 schema.sql에서 plain
  `text` 컬럼이라 check-enum-sync 대상 아님 — 실제로 확인함).

**T3.3.2 알림 키워드 CRUD (S7)**: `/alerts` — 로그인 안 했으면 카카오/구글 로그인 버튼만
보여주고(정직한 게이트, dangling 기능 없음), 로그인 상태면 서버 컴포넌트가 `listAlertKeywords`로
직접 DB 조회 후 `AlertsClient`(클라이언트 컴포넌트)에 넘긴다. 무료 플랜 키워드 5개 상한은
`createAlertKeyword`가 등록 직전에 개수를 세어 강제(402), 중복 키워드는 `alert_keyword`의
UNIQUE(user_id, keyword_norm)로 막고 409. `lib/nav.ts`의 `alerts` 항목을 `ready:true`로
전환 — 하단 탭 4개가 이제 전부 살아있다.

**T3.3.3 웹푸시 구독 + 서비스워커**: `apps/web/public/sw.js`(push/notificationclick 핸들러,
docs/05 S7 페이로드 형식 그대로 표시) + `lib/push/subscribe-client.ts`(권한 요청 →
서비스워커 등록 → `PushManager.subscribe` → `POST /v1/push/subscribe`). VAPID 키는
`npx web-push generate-vapid-keys`로 이번에 로컬 검증용 실 키 쌍을 직접 생성해 `.env`에
넣었다(더미 값이 아니라 진짜 VAPID 키). 발송 쪽(`web-push` npm 패키지)은 `apps/worker`에
새 의존성으로 추가.

**T3.3.4 발송 잡**: 판정 로직은 `packages/core/src/alerts/dispatch-policy.ts`에 순수
함수로 뒀다(R7) — `matchesAlertKeyword`(키워드가 클러스터 제목/개체에 포함되는가),
`isQuietHoursKst`(KST 22:00~07:00, 서버 타임존과 무관하게 UTC 인스턴트를 직접 환산),
`decideAlertDispatch`(연결강도·밈포함여부·일일상한·무음시간대를 순서대로 검사). 유닛테스트
11건. 무음 시간대/일일 상한은 "거부"가 아니라 "보류"로 설계함 — `alert_delivery` insert를
하지 않으므로 다음 배치에서 조건이 바뀌면(예: 무음 시간대 종료) 같은 클러스터가 다시
후보로 올라온다(docs/11 §3 멱등성 원칙과 동일한 사고방식).
- DB 조회·실제 발송(IO)은 `apps/worker/src/alerts/dispatch-alerts.ts`가 담당 — 클러스터의
  활성 연결과 활성 키워드 전체를 조회해 매칭 판정을 돌리고, 통과한 키워드마다 가장 점수가
  높은 연결 하나로 `alert_delivery`(UNIQUE(alert_id, cluster_id))를 먼저 insert해서
  동시성/재실행에도 중복 발송이 안 되게 한 뒤에만 실제 push를 보낸다. push가 404/410(Gone)로
  실패하면 그 자리에서 `push_subscription`을 정리한다.
- `apps/worker/src/pipeline/alert-dispatch.processor.ts`: 새 BullMQ 큐 `alert.dispatch`
  (동시성 2, docs/11 §1). `connection-build.processor.ts`가 연결을 1건 이상 저장하면 이
  큐에 바로 잡을 넣는다(⑫ 완료 트리거, `news-analyze.processor.ts`가 `connection.build`를
  잡는 방식과 동일한 패턴).
- `apps/web/lib/format/tone.ts`의 `isMemeConnection`을 `packages/core/src/scoring/meme.ts`로
  옮기고 web 쪽은 재수출만 하도록 정리 — 워커도 똑같은 밈 판정 규칙(CLAUDE.md §6)이
  필요해졌는데, 두 곳에 같은 한 줄 로직을 복사해 두면 나중에 하나만 고치고 잊어버리는 사고가
  날 게 뻔해서 R7 원칙대로 `packages/core`로 합쳤다.
- **실 검증**: `scripts/manual-verify-w8-alerts.ts`(커밋에 남김, manual-verify-*.ts와 동일
  성격) — `pnpm --filter @gukjang/web dev` + 실 로컬 postgres 대상으로, 세션 쿠키를 직접
  서명해 만든 뒤(OAuth 왕복은 여전히 막혀 있으니) `/v1/alerts` CRUD·`/v1/push/subscribe`를
  실 API로 확인하고, "삼성전자" 키워드 + 실제로 시드돼 있던 "삼성전자..." 헤드라인 클러스터로
  `dispatchAlertsForCluster`를 직접 돌려 **매칭 → 발송 → 페이로드
  `"삼성전자" 뉴스 발생 · 연결 발견: 삼성전자 (DIRECT 46)`(docs/05 S7 예시 포맷과 동일 구조)
  → 가짜 구독이 410을 반환하자 그 자리에서 `push_subscription` 정리 → 같은 클러스터로
  재실행하면 `alert_delivery` UNIQUE 덕에 중복 발송 안 됨**까지 전부 실제로 재현해서
  확인했다. 실 브라우저 푸시 수신(진짜 서비스워커가 알림을 띄우는 것)과 실 OAuth 왕복만
  이 환경의 한계로 못 봤다 — 나머지 전체 파이프라인은 실 DB로 끝까지 확인함.

**미룬 것**:
- `apps/web/app/api/v1/discovery/requests`의 IP/계정 레이트리밋(docs/07 §4)은 W6에서
  "W8 인증 붙을 때 같이 넣는다"고 미뤄뒀던 항목인데, 이번에도 손대지 않았다 — 전역
  레이트리밋 미들웨어(Redis 기반)는 알림 발송 루프와 별개 작업이라 범위를 넘어간다고
  판단, 다음 스텝 후보로 다시 남김.
- PWA 아이콘(`/icons/icon-192.png`)이 아직 없어 `sw.js`의 알림 아이콘 참조가 깨진 상태다
  (브라우저는 조용히 기본 아이콘으로 대체하므로 기능은 살아있음) — T5.2에서 매니페스트와
  같이 만들 것.
- 카카오/구글 앱을 개발자 콘솔에 등록해 실 CLIENT_ID/SECRET을 받는 일은 이 환경에서 할 수
  없는 사용자 쪽 작업이다 — `.env.example`에 자리는 만들어 뒀다.

**⚠️ W7에서 남겨뒀던 KIS 라이브 검증 후기록**: 지난 세션에 실 `KIS_APP_KEY`로 시세
조회(`005930`)를 딱 1회 성공시켰었는데(`rt_cd:"0"`, 정상 응답) 그 결과를 이 문서에
못 남기고 넘어갔었다. 재시도는 KIS 토큰 발급 레이트리밋(HTTP 403)에 바로 걸려 필드
단위까지 반복 확인은 못 했지만, **KIS 연동이 실제로 살아있다는 것 자체는 그 1회 성공으로
이미 확인된 사실**이라 여기 정정해서 남긴다(W7 섹션의 "KIS_APP_KEY/SECRET이 이 환경엔
없어 라이브 검증은 못 했지만"이라는 서술은 그 뒤에 실제로 키가 생겨 부분적으로 낡았다).

**T4.2 관리자 검수 큐 UI**: `/admin/review` — docs/03-ia.md 공개 라우트 표에는 없는 내부
전용 화면이라 마스트헤드/하단 네비게이션 대상 IA에는 안 넣었다(URL을 직접 아는 운영자만
접근). 다만 `app/layout.tsx`가 전역이라 마스트헤드/하단 네비/고지 푸터가 이 화면에도 그대로
붙는다 — 소비자 화면용 chrome을 빼려면 라우트 그룹 리팩터(기존 6개 화면을 전부
`app/(consumer)/`로 옮기는 작업)가 필요해 이번 주 범위에서는 미용상 문제로만 남기고
손대지 않았다.
- **인가 방식(중요한 단순화)**: docs/07 §5는 "관리자 API는 별도 role 클레임 + IP
  허용목록"이라고 정의하지만, `app_user`에 role 컬럼이 없고(스키마에 없음) 이 프로덕트는
  "1인 개발"(docs/15 헤더)이 전제라 실제 다중 운영자 RBAC을 지금 새로 설계하는 건 시기상조라고
  판단했다. 대신 공유 시크릿 헤더(`X-Admin-Token` == `ADMIN_API_TOKEN`)로 V1을 통과시키고,
  이 결정과 이유를 `lib/auth/admin-guard.ts` 주석에 그대로 남겼다 — 운영자가 여러 명이 되면
  그때 `app_user.role` 컬럼 + JWT role 클레임으로 교체할 것.
- `lib/api/admin.ts`: `listReviewQueue`(status=PENDING인 것만, 또는 `onlyFlagged=false`로
  상태 무관 최근 50건 — "출시 후 첫 4주" 절의 "매일 아침 연결 30건 육안 검수"에 쓸 수 있게)
  + `submitConnectionReview`(APPROVE→ACTIVE/REJECT→REJECTED/CORRECT→CORRECTED,
  `connection_review`에 감사로그 남김).
- **알려진 단순화**: docs/10 §8 "미검수 연결은 connection_score 상한 95" 해제(재계산)는
  구현하지 않았다 — `computeConnectionScore`가 필요로 하는 `hasEvidenceGap`/`ambiguousAlias`
  플래그가 `connection` 테이블에 저장돼 있지 않아서, 저장 안 된 값을 사후 추정해 재계산하면
  틀린 점수를 만들 위험이 실제 이득(95→100 사이 몇 점)보다 크다고 판단했다. CORRECT 액션의
  patch 범위도 `explanation`/`businessRelevance` 두 필드로만 한정했다(연결을 다른 회사로
  옮기는 것은 범위 밖 — 그 정도로 틀렸으면 REJECT가 맞는 액션).
- **실 검증**: 실 로컬 postgres + 실행 중인 서버로 토큰 없음(401)/틀린 토큰(401)/정상
  토큰(200) 전부 확인. 실 PENDING 연결(id=144, 삼성바이오로직스 NAME_MATCH) 하나를 실제로
  APPROVE(→ACTIVE, `connection_review`에 감사로그 생성 확인)했다가 CORRECT(explanation 교체,
  →CORRECTED)까지 순서대로 돌려 두 액션 다 실제로 동작하는 것을 확인한 뒤, 검증 흔적을
  지우려고 `connection_review` 테스트 행을 지우고 status를 PENDING으로 되돌렸다 — **다만
  CORRECT 테스트에서 덮어쓴 explanation 원문은 미리 저장해두지 않아 복구하지 못했다**(정직하게
  남김: 로컬 시드 데이터 한 행의 설명문이 검증용 텍스트로 남아있음, 프로덕션/커밋 대상
  아니므로 실질적 영향은 없음). `/admin/review` 페이지 렌더·토큰 프롬프트도 curl로 HTML
  확인함. `next build` 29개 라우트로 재확인.

**다음 스텝**: E5(고지/약관/개인정보처리방침, PWA 매니페스트+아이콘, 분석 이벤트, Sentry,
배포, 자본시장법 체크리스트).

**검증**: `make ci` 전체(format-check/lint/typecheck/test 378건(core 291+web 47+worker 40)/check-enum-sync/
lint-forbidden-words) 클린 통과, `next build` 프로덕션 빌드 성공(29개 라우트 — 알림 CRUD
5개+OAuth 4개+push 1개+관리자 검수 3개 라우트 추가). E3.3 게이트("키워드 등록 → 매칭 뉴스
발생 → 실제 푸시 도착")는 실 브라우저 알림 수신 직전까지("발송 결정 → alert_delivery 저장 →
sendPush 호출") 실 DB·실 서버로 확인했고, 마지막 한 칸(진짜 브라우저가 알림을 띄우는 것)만
이 환경(헤드리스, 실 브라우저 없음)의 한계로 못 봤다 — 정직하게 🔶로 남긴다. T4.2는 승인/
정정 두 액션 모두 실 DB에서 상태 전이까지 확인해 완료로 본다.

**E5 진행 기록** (사용자 확인: 커밋은 E5까지 마저 끝낸 뒤 한 번에 / 법적 문서는 초안만 /
T5.5는 설정 파일 스캐폴딩만).

**T5.1 고지·이용약관·개인정보처리방침**: `/legal/terms`, `/legal/privacy` 신설(기존
`/legal/disclaimer`에 상호 링크 추가). 둘 다 상단에 "초안입니다, 변호사 검토 전"이라고
명시(docs/01 §7 원문 톤 그대로). 개인정보처리방침이 "계정 삭제 요청 가능"을 약속하길래
실제로 뒷받침되는 기능인지 확인했더니 없었다 — `DELETE /v1/auth/me`(회원 탈퇴, cascade로
alert_keyword/push_subscription까지 삭제)를 새로 만들고 `/alerts` 화면에 로그아웃/탈퇴
버튼을 붙여 문서가 약속하는 기능을 실제로 채웠다(실 DB로 탈퇴→cascade 확인함).
**작성 중 금지어 린터(R5/D4)가 실제로 작동하는 것을 목격**했다 — 이용약관 초안에 "투자
추천·투자자문·투자권유가 아니며, 매수·매도를 권유하지 않습니다"라고 쓴 게 "추천"/"매수"/
"매도"에 걸려 `make ci`가 막혔다. `SAFE_PHRASES`(정확히 D3 문구만 예외)에 새로 추가하는
대신, D3 원문 문장을 그대로 재사용하고 나머지는 그 단어들 자체를 안 쓰는 표현으로 바꿔
썼다("특정 종목에 대한 거래를 지시하지 않습니다") — 가드레일을 넓히기보다 카피를 가드레일에
맞춘 것.

**T5.2 PWA**: `app/manifest.ts`(Next.js 특수 파일, `/manifest.webmanifest` 자동 서빙),
`app/apple-icon.tsx`(180×180), `app/icons/192`·`app/icons/512`(Route Handler) 전부
`next/og`의 `ImageResponse`로 렌더 — 별도 아이콘 파일을 그리는 대신 이미 검증된 OG 이미지
렌더 경로(`fetchKoreanFont` 포함)를 재사용했다. 실제 PNG로 렌더해 192×192/180×180 크기가
맞는 것, manifest JSON이 유효한 것까지 확인(아이콘 이미지 직접 확인 — 종이 배경에 "국" 글자).
iOS 홈화면 안내는 `/alerts`의 웹푸시 섹션에 `navigator.standalone` 체크로 조건부 표시(Safari
공유 → 홈 화면에 추가 3단계 안내). `sw.js`가 참조하던 존재하지 않는 아이콘 경로도 이번에
같이 고쳐졌다.

**T5.3 분석 이벤트 설계**: 실 분석 프로바이더(PostHog/GA4 등)는 아직 미정이라 이벤트
taxonomy(`card_view`/`graph_open`/`share`/`feedback_submit`/`alert_register`, docs/14
EPIC5 문구 그대로)와 발생 지점만 확정해 실제 UI에 배선했다 — 전송은 `sendBeacon`으로 자체
스텁 싱크(`POST /v1/analytics/events`, 구조화 로그만 남김)에 보내고, 프로바이더가 정해지면
`lib/analytics/track.ts` 내부만 바꾸면 되게 분리했다. `card_view`는 홈 뉴스 카드 클릭에만
배선했다(발견/검색 등 다른 카드 종류는 같은 패턴을 나중에 따라 붙이면 된다 — 범위를
일부러 좁힘). **작업 중 실제로 next build를 한 번 깨뜨렸다**: 카드 클릭 추적을 달려고
`NewsClusterCard`(서버 컴포넌트)를 통째로 `'use client'`로 바꿨더니, 그 컴포넌트가
`CompanyChip`→`tone.ts`를 거쳐 `@gukjang/core` 배럴 전체(그 안의 `env.ts`가 쓰는
`node:fs`/`node:path`, `input-hash.ts`가 쓰는 `node:crypto`)를 브라우저 번들로 끌고 들어가
`next build`가 `UnhandledSchemeError`로 실패했다. 카드 전체를 클라이언트로 바꾸는 대신
`Link`+추적만 하는 얇은 클라이언트 래퍼(`TrackedNewsLink`)로 분리해 고쳤다 — RSC에서
"서버 컴포넌트 children을 감싸는 얇은 클라이언트 컴포넌트" 패턴. 이 삽질 자체가 이번 주의
좋은 교훈이다: 클릭 핸들러 하나 때문에 이미 무거운 서버 컴포넌트를 통째로 client로 바꾸지
말 것.

**T5.4 에러 추적(Sentry) 스캐폴딩**: 계정을 만들지 않은 상태라 `SENTRY_DSN`이 비어 있으면
`Sentry.init()`을 아예 호출하지 않게 했다(코드는 있지만 완전히 비활성). Next.js 15 App
Router의 최신 관례(`instrumentation.ts`+`instrumentation-client.ts`+
`sentry.server.config.ts`+`sentry.edge.config.ts`, 예전 `sentry.client.config.ts`
방식이 아님)를 학습 시점 지식으로 바로 안 쓰고 Sentry 공식 문서를 다시 확인한 뒤 그대로
따라 썼다 — 이 종류의 SDK 관례는 자주 바뀌어서(claude-api 스킬이 Claude API 자체에 대해
경고하는 것과 같은 종류의 "API drift") 그냥 기억에 의존하면 안 된다고 판단했다.
`next.config.ts`는 `SENTRY_ORG`/`SENTRY_PROJECT`가 없으면 `withSentryConfig`로 감싸지
않는다(감싸면 빌드 시 소스맵을 업로드하려다 인증 없이 실패할 수 있어서) — 실제로 이 상태로
`next build`가 여전히 성공하는 것까지 확인함(다만 클라이언트 번들에 Sentry SDK 자체는
포함돼 First Load JS가 102kB→183kB로 커졌다 — DSN이 생기면 바로 켜지도록 하는 대가로
감수한 트레이드오프, 나중에 dynamic import로 줄이는 것도 가능). `apps/worker`는
`@sentry/node`로 `main.ts` 최상단에서 `initSentry()`(DSN 없으면 no-op) + bootstrap 실패시
`Sentry.captureException` 배선. 잡 단위(BullMQ 'failed' 이벤트) 캡처는 API를 확인 안 하고
추측으로 배선하고 싶지 않아 이번엔 안 했다 — 다음 스텝 후보.

**T5.5 배포 설정 파일 스캐폴딩**: 루트 `vercel.json`(pnpm 모노레포용 buildCommand/
installCommand/outputDirectory), `apps/worker/Dockerfile`+`.dockerignore`. **Dockerfile을
쓰다가 이 모노레포의 실제 프로덕션 실행 경로가 깨져 있는 것을 발견해 같이 고쳤다**:
`apps/worker/package.json`의 `"start": "node dist/main.js"`가 한 번도 실제로 검증된 적
없었다는 걸 알아채고 직접 돌려봤더니 `ERR_MODULE_NOT_FOUND`로 즉시 깨졌다 — 이 리포는
`packages/core`/`packages/db`/`spec`의 `package.json` `exports`가 컴파일된 `dist`가 아니라
**소스(.ts)를 직접** 가리키는 설계라(항상 번들러/tsx로 돌리는 전제), `tsc`로 컴파일한
`dist/main.js`를 plain `node`로 실행하면 상대경로 확장자 문제 이전에 애초에
`@gukjang/core`부터 못 읽는다. `start` 스크립트를 `tsx src/main.ts`로 바꿔(`tsx`를
dependencies로 이동) `dev`와 동일한 경로로 프로덕션도 돌게 고쳤다 — 실제로
`pnpm --filter @gukjang/worker start` + `/health` 200으로 확인함. `apps/web:build`도 재확인
(34개 라우트, `next build` 성공). Docker 이미지 자체는 **이 개발 환경에 Docker가 없어 빌드
검증은 못 했다** — Dockerfile 로직은 신중히 검토했지만 정직하게 미검증으로 남긴다.
새 `docs/18-deployment.md`에 구성요소별 배포 대상·필요 환경변수·남은 결정(호스팅 선택,
계정 생성)을 정리했다.

**T5.6 자본시장법 검토 체크리스트**: docs/01 §7 D1~D5 + §9 안티골을 실제 코드/스키마
대조해 확인했다.
| 결정 | 확인 방법 | 결과 |
|---|---|---|
| D1 무료 V1, 과금 flag off | `FEATURE_PAID_PLANS_ENABLED` 기본값 확인 | ✅ false |
| D2 제보 1:1 응답 금지 | `lib/api/discovery.ts` 구현 확인 | ✅ 공개 큐만, 응답 없음 |
| D3 고지 문구 전 화면 | `app/layout.tsx`가 전역 렌더하는지 확인 | ✅ 관리자 화면 포함 전부 |
| D4 금지어 CI 린터 | `make ci` 게이트에 포함되는지 확인 | ✅ (이번 세션에 실제로 걸리는 것도 목격) |
| D5 본문 미저장, 이미지 핫링크 금지 | `spec/schema.sql` news_article 컬럼 + `<img>` 사용처 검색 | ✅ `lead`만(비노출), `<img>` 사용 0건 |
| §9 안티골(매매/백테스트/토론방/"TOP5") | 코드베이스 전체 검색 | ✅ 해당 기능 존재하지 않음 |
이 체크는 **변호사 검토를 대체하지 않는다**(docs/01 §7 원문 그대로) — 실 유료화·알림 상용화
전 전문 검토가 여전히 필요하다.

**검증(E5 전체)**: `make ci` 클린 통과(format-check/lint/typecheck/test 380건(core 291+
web 49+worker 40)/check-enum-sync/lint-forbidden-words), `next build` 프로덕션 빌드 성공
(34개 라우트 — 법적 문서 3개+manifest+apple-icon+아이콘 2개+분석 이벤트 1개 추가),
`pnpm --filter @gukjang/worker start`로 워커 실제 기동 확인(`/health` 200, 이번에 고친
경로). Docker 빌드 자체와 실 Sentry/Kakao/Google 계정 연동은 이 환경의 한계로 미검증 —
정직하게 남긴다.

---
## 주차별 게이트 (통과 못 하면 다음 주로 넘어가지 않는다)
| 주 | 게이트 |
|---|---|
| W2 | 스크립트로 `노루`→노루페인트 후보가 나온다 |
| W3 | 기사:클러스터 압축률 ≥ 10:1 |
| W4 | 일일 LLM 비용이 상한 내에서 예측 가능하다 |
| W5 | 골든셋 통과율 ≥ 90%, 오탐 함정 0 |
| W6 | 실기기에서 그래프가 부드럽다 — 🔶 데스크톱/Playwright로 팬·줌·탭 확인, 실 모바일 기기 검증은 남음 |
| W7 | 종목 상세 역방향에서 "연결 미발견"이 정직하게 뜬다 — ✅ 확인(005930). 골든셋은 실 API 키로 라이브 버그 2건(strict tool schema, temperature) + 프롬프트 튜닝까지 마쳐 최종 17/17(100%) |
| W8 | 하루 종일 무인 운영으로 파이프라인이 돈다 — 🔶 코드·로직은 실 DB로 검증(알림 매칭→발송
결정→push 호출, 관리자 승인/정정). 실제 "하루 종일 무인 운영"은 실 배포(T5.5 남은 결정) +
실 Kakao/Google/Sentry 계정 연동 이후에만 확인 가능 |

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
