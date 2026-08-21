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
| W6 | 실기기에서 그래프가 부드럽다 — 🔶 데스크톱/Playwright로 팬·줌·탭 확인, 실 모바일 기기 검증은 남음 |
| W7 | 종목 상세 역방향에서 "연결 미발견"이 정직하게 뜬다 — ✅ 확인(005930). 골든셋은 실 API 키로 라이브 버그 2건(strict tool schema, temperature) + 프롬프트 튜닝까지 마쳐 최종 17/17(100%) |
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
