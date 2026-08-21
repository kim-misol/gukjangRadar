# STEP 11. 뉴스 → 종목 연결 Pipeline

> 구현: `apps/worker` (NestJS + BullMQ). 큐는 단계마다 하나씩. 각 단계는 **멱등**이어야 한다.

## 0. 전체 흐름
```
 ①수집 → ②정규화 → ③중복제거 → ④클러스터링 → ⑤요약(LLM) → ⑥개체추출(LLM)
   → ⑦개체 정규화·병합 → ⑧후보 검색(결정론) → ⑨LLM 심사 → ⑩반증검사(LLM, 고득점만)
   → ⑪시세 결합 → ⑫스코어링·가드레일 → ⑬저장·캐시무효화 → ⑭알림 발송
```
LLM은 ⑤⑥⑨⑩ **네 곳에서만** 호출된다. 나머지는 전부 결정론이다.

## 1. 큐와 SLA
| # | 큐 | 트리거 | 동시성 | p95 목표 | 재시도 |
|---|---|---|---|---|---|
| ① | `news.collect` | cron `*/2 * * * *` (07:00~20:00 KST) | 4 | 20s | 3, 지수백오프 |
| ④ | `news.cluster` | ① 완료 | 1 | 5s | 3 |
| ⑤⑥ | `news.analyze` | ④ 신규 클러스터 | 4 | 15s | 2 |
| ⑧⑨⑩ | `connection.build` | ⑥ 완료 | 4 | 30s | 2 |
| ⑪⑫ | `connection.score` | ⑨ 완료 + cron `*/5` 장중 | 8 | 3s | 3 |
| ⑭ | `alert.dispatch` | ⑫ 완료 | 2 | 5s | 3 |

**뉴스 발행 → 카드 노출 p50 5분** 목표(PRD 성공지표). 병목은 ⑨.

## 2. 단계별 명세

### ① 수집 `news.collect`
> **소스 선정과 접근 방법은 `docs/16-news-sources.md`가 원본이다.** 여기서는 큐 동작만 다룬다.
- A층(언론사 RSS 전량 스트림) + B층(Trends·시장 이상치·DART 공시 신호) + C층(네이버 검색 보강)을 각각 다른 주기로 폴링한다.
- `news_source.tier`로 신뢰도 구분, `kind`로 수집기 분기.
- 저장: 제목·URL·매체·발행시각·`lead`(200자, 요약 입력용 임시). **본문 저장 금지**(PRD D5).
- 멱등 키: `url` UNIQUE. 이미 있으면 skip.
- robots.txt 준수, 매체당 요청 간격 ≥ 1s.

### ② 정규화
제목에서 `[속보]`, `[단독]`, 매체명 접미, 따옴표 종류 통일, 전각→반각.

### ③ 중복 제거
`simhash(title)` 해밍거리 ≤ 3 → 동일 기사로 간주.

### ④ 클러스터링
- 1차: 제목 토큰 자카드 ≥ 0.5
- 2차: 임베딩 코사인 ≥ 0.88 (1차 통과분만 — 임베딩 비용 절감)
- 시간 창 24시간. 창을 벗어나면 새 클러스터.
- 대표 기사: `source_tier` 최상위 → 발행 최선 순.
- `heat_score = log2(article_count) × 20 + tier_bonus + 속도(최근 1시간 증가분)`

### ⑤ 요약 `LLM`
3문장. 원문 20자 초과 인용 금지. 입력은 대표 기사 제목 + `lead` + 클러스터 내 다른 제목 5개.

### ⑥ 개체 추출 `LLM`
`spec/prompts/entity_extraction.md` 참조. 캐시 키 = `sha256(headline+summary+prompt_version)`.

### ⑦ 개체 정규화·병합
정규화 → `entity` upsert → `graph_node(ENTITY)` upsert → `graph_edge(MENTIONS)` 생성(news→entity) → `news_entity` 저장.
불용 개체(`entity_stoplist`) 제거.

### ⑧ 후보 검색 (결정론, LLM 없음)
개체별로 `09-prompt-company-matching.md §2`의 8개 룰을 병렬 실행 → 후보 합집합 → `recallScore` 정렬 → 상한 40.
동시에 **경로(path)** 를 만든다. 후보는 반드시 경로를 갖고 태어난다(R2).

재귀 CTE 예시 (그래프 확장, 최대 3홉):
```sql
WITH RECURSIVE walk AS (
  SELECT e.dst_node_id AS node_id, 1 AS hop,
         ARRAY[e.src_node_id, e.dst_node_id] AS nodes,
         ARRAY[e.id] AS edges, e.weight AS w
  FROM graph_edge e
  WHERE e.src_node_id = $1 AND e.is_active
  UNION ALL
  SELECT e.dst_node_id, w.hop + 1,
         w.nodes || e.dst_node_id, w.edges || e.id, w.w * e.weight
  FROM walk w
  JOIN graph_edge e ON e.src_node_id = w.node_id AND e.is_active
  WHERE w.hop < 3
    AND NOT e.dst_node_id = ANY(w.nodes)      -- 사이클 방지
    AND w.w * e.weight >= 0.15                -- 가지치기
)
SELECT n.ref_id AS company_id, w.*
FROM walk w JOIN graph_node n ON n.id = w.node_id
WHERE n.kind = 'COMPANY'
ORDER BY w.w DESC LIMIT 40;
```
`NOT ... = ANY(nodes)`(사이클 방지)와 `w >= 0.15`(가지치기) 둘 다 없으면 이 쿼리는 폭발한다. 반드시 유지할 것.

### ⑨ LLM 심사
후보 배치를 한 번의 호출로. 40개 초과 시 20개씩 분할.
파서 검증: `company_id ∈ 후보집합` 아니면 폐기 + `G1` 기록.

### ⑩ 반증 검사
`businessRelevance ≥ 60`인 것만. 결과가 `refuted=true`면 `adjusted_relevance`로 교체하고 `counter_evidence`에 사유 저장.

### ⑪ 시세 결합
`market_snapshot` 최신 행 조인. 없으면 `MR = null`.
장중 5분 배치로 `connection.score` 재실행 → 시장 반응 점수만 갱신(LLM 재호출 없음).

### ⑫ 스코어링 + 가드레일
`10-scoring.md` 공식 적용 → `13-validation.md`의 G1~G9 검사 → 통과분만 `status=ACTIVE`.
`reviewTriggers` 해당분은 `PENDING`으로 두고 관리자 큐로 보낸다.

### ⑬ 저장·캐시 무효화
`connection` upsert(UNIQUE `cluster_id, company_id, connection_type`) → 관련 CDN 태그 purge(`news:{id}`, `stock:{ticker}`, `home:{date}`).

### ⑭ 알림
`alert_keyword.keyword_norm`이 클러스터 제목/개체에 매칭 && `connection_score ≥ min_score` && (`include_meme` 또는 non-MEME)
→ `alert_delivery` UNIQUE(alert_id, cluster_id)로 중복 차단 → 키워드당 일 3회 상한 → 22:00~07:00 보류.

## 3. 멱등성 규칙
| 단계 | 멱등 키 |
|---|---|
| ① | `news_article.url` |
| ④ | `cluster_article` PK |
| ⑤⑥ | `llm_run.input_hash` 재사용 |
| ⑦ | `entity(name_norm, kind)`, `graph_edge(src,dst,type)` UNIQUE |
| ⑫ | `connection(cluster_id, company_id, type)` UNIQUE |
| ⑭ | `alert_delivery(alert_id, cluster_id)` UNIQUE |

재실행해도 중복이 생기지 않아야 한다. 파이프라인은 **언제든 통째로 다시 돌릴 수 있어야** 한다.

## 4. 비용 관리
| 항목 | 추정 |
|---|---|
| 일 뉴스 기사 | 3,000~8,000건 |
| 클러스터 후 | 150~400건 |
| LLM 호출/클러스터 | 요약1 + 개체1 + 심사1~2 + 반증0~1 ≈ 4 |
| 일 호출 | 600~1,600 |
| 입력 토큰/호출 | 1.5K~3K |

절감 수단(우선순위 순):
1. **클러스터링** — 기사 20배를 클러스터 1개로. 가장 큰 절감.
2. `input_hash` 캐시 — 재보도 히트율 30~50%.
3. 후보 40 상한 + `business_summary` 1~2문장 제한.
4. 요약·개체는 저비용 모델, 심사·반증만 고성능 모델.
5. `heat_score` 하위 클러스터는 분석 스킵(`analysis_status = SKIPPED`).

일일 비용 상한을 환경변수로 두고 초과 시 ⑤⑥부터 스킵한다. **비용 상한 없이 프로덕션에 올리지 말 것.**

## 5. 관측
- 큐별 대기/처리 시간, 실패율
- 단계별 드롭률 (기사 → 클러스터 → 개체 → 후보 → ACCEPT → ACTIVE)
- 일일 LLM 비용, `G1~G9` 위반 건수
- 뉴스 발행 → 노출 지연 히스토그램

드롭률 곡선이 이 시스템의 건강검진표다. ACCEPT율이 갑자기 90%로 뛰면 프롬프트가 무너진 것이고, 5%로 떨어지면 후보 검색이 망가진 것이다.
