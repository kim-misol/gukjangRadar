# STEP 6. Database ERD

> DDL 원본: `spec/schema.sql` (이 문서는 **설계 근거**만. 컬럼 목록을 여기에 복붙하지 말 것)

## 1. 핵심 설계 결정

### D-A. 그래프를 별도 DB로 빼지 않는다
Neo4j 대신 PostgreSQL의 `graph_node` / `graph_edge` 2테이블 + 재귀 CTE로 간다.
- 근거: MVP의 탐색 깊이는 **최대 4홉**이고 노드 규모는 상장사 2,800 + 개체 수십만 수준. 재귀 CTE로 충분하다.
- 운영 DB를 하나로 유지하면 트랜잭션·백업·조인이 단순해진다. 규모가 커지면 그때 Neo4j/Memgraph로 뽑는다.

### D-B. 노드는 다형(polymorphic), 실체 테이블은 따로
`graph_node(kind, ref_id)`가 `news_cluster` / `entity` / `concept` / `company`를 가리킨다.
- 이유: 탐색 쿼리는 노드 종류를 몰라도 되고, 실체 테이블은 각자의 컬럼을 자유롭게 갖는다.
- `UNIQUE(kind, ref_id)` 필수.

### D-C. 엣지는 사실(fact), 연결은 산출물(artifact)
| | `graph_edge` | `connection` |
|---|---|---|
| 성격 | 세상에 대한 사실 (계열사다, 이름이 같다) | 특정 뉴스에 대한 해석 결과 |
| 수명 | 길다 (기업 관계는 잘 안 변함) | 하루짜리 |
| 생성 | 룰/DART/사전/사람 | 파이프라인 실행 |
| 재계산 | 안 함 | 매 실행마다 |

엣지를 뉴스마다 새로 만들면 그래프가 오염된다. **뉴스별 해석은 반드시 `connection`에 담는다.**

### D-D. 경로는 `connection.path`에 비정규화 저장
탐색 결과 경로(노드/엣지 id 배열 + 라벨)를 JSONB로 굳혀 둔다.
- 이유: 화면은 항상 "그때 그 경로"를 보여줘야 한다. 나중에 엣지가 수정돼도 과거 카드의 설명이 바뀌면 안 된다(감사 추적).
- 렌더는 이 JSONB만 읽으면 되므로 그래프 API가 단일 쿼리로 끝난다.

### D-E. 점수는 컬럼, 가중치는 파일
6종 점수는 `connection`의 개별 컬럼(정렬·필터 때문에). 가중치는 `spec/scoring.config.json`. `scoring_version`을 행에 남겨 A/B와 회귀 비교를 가능하게 한다.

### D-F. 뉴스 본문은 저장하지 않는다
`news_article`은 제목·URL·매체·발행시각·**해시**만. 요약은 `news_cluster.ai_summary`(3문장). 저작권 리스크 회피(PRD D5).

### D-G. 모든 LLM 호출은 `llm_run`에 남긴다
프롬프트 버전, 입력 해시, 출력 JSON, 토큰, 비용, 지연. 이게 없으면 "왜 저 연결이 나왔지?"를 영원히 못 푼다.

## 2. 관계 다이어그램
```
news_source ─< news_article >─ cluster_article ─< news_cluster
                                                     │
                                                     ├─< news_entity >─ entity
                                                     │                    │
                                                     │              graph_node(ENTITY)
                                                     │                    │
                                                     └─< connection ──────┤ (path JSONB)
                                                            │             │
                                                            │        graph_edge
                                                            │             │
                                                        company ── graph_node(COMPANY)
                                                            │
                                                            ├─< company_alias
                                                            └─< market_snapshot

app_user ─< alert_keyword ─< alert_delivery
app_user ─< connection_feedback >─ connection
connection ─< connection_review        (관리자 검수)
llm_run   (모든 AI 호출 감사 로그)
```

## 3. 예시 데이터 흐름 — "태풍 노루"
```
news_cluster #101  "태풍 '노루' 북상"
  news_entity → entity #55 (name='노루', type=WORD, subtype=TYPHOON_NAME)
  graph_node #900 (ENTITY, 55)
  graph_edge #7001  900 → 1203(COMPANY 노루페인트)  type=NAME_MATCH  weight=1.0
      evidence={"rule":"alias_exact","alias":"노루","source":"company_alias#88"}
  graph_edge #7002  1203 → 1204(COMPANY 노루홀딩스) type=AFFILIATION  weight=0.9
      evidence={"source":"DART","corp_code":"00126380","doc":"최대주주현황"}

connection #5001
  news_cluster_id=101, company_id=1203(노루페인트), type=NAME_MATCH
  path=[{node:101,label:"태풍 노루"},{node:900,label:"노루"},{node:1203,label:"노루페인트"}]
  business_relevance=12  keyword_match=98  market_reaction=81  meme=87  confidence=95
  connection_score=?  (spec/scoring.config.json 로 계산)
connection #5002  → 노루홀딩스, type=AFFILIATION, 경로 4홉
```

## 4. 인덱스 전략 (중요한 것만)
| 대상 | 인덱스 | 용도 |
|---|---|---|
| `company_alias.alias_norm` | `pg_trgm` GIN | 유사 이름 검색(밈 연결의 심장) |
| `company_alias.alias_jamo` | btree + trgm | 자모 단위 편집거리 후보 축소 |
| `graph_edge(src_node_id, edge_type)` | btree | 순방향 탐색 |
| `graph_edge(dst_node_id, edge_type)` | btree | 역방향 탐색(종목→뉴스) |
| `connection(news_cluster_id, connection_score DESC)` | btree | 뉴스 상세 정렬 |
| `connection(company_id, trade_date)` | btree | 종목 상세 |
| `entity.embedding` | `ivfflat` (pgvector) | 테마 확장 (V1.1) |
| `news_article.simhash` | btree | 중복 제거 |

## 5. 보존 정책
| 테이블 | 보존 |
|---|---|
| `market_snapshot` | 90일 상세 → 이후 일봉만 |
| `llm_run` | 30일 (비용 큼) — 단, 골든셋 관련 run은 무기한 |
| `connection` | 무기한 (과거 유사 사례 기능의 자산) |
| `news_article` | 무기한 (메타만이라 가벼움) |
