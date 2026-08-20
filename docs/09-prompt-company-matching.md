# STEP 9. AI Company Matching — 설계 (Closed-World)

> 프롬프트 원본: `spec/prompts/company_matching.md` (버전 `cm-v1`)

## 1. 이 단계의 원칙: LLM은 판사이지 검사가 아니다
후보를 **찾는 일은 코드가** 하고, LLM은 그 후보를 **기각하거나 등급을 매기는 일만** 한다.

```
[결정론적 Recall]  →  후보 5~40개  →  [LLM Judge]  →  ACCEPT/REJECT + 유형 + 설명
     ↑ 여기서만 종목이 생긴다              ↑ 여기서는 종목이 절대 생기지 않는다
```

프롬프트에 후보 목록을 주고 **`company_id`는 반드시 제시된 목록 안의 값이어야 한다**고 강제한다.
파서는 목록 밖 id가 오면 그 항목을 버리고 `guardrail_violation(G1)`에 기록한다.

## 2. Recall 룰 (결정론, `packages/core/recall/`)
| 룰 | 방법 | 예 | 기본 recallScore |
|---|---|---|---|
| `ALIAS_EXACT` | `company_alias.alias_norm = entity.name_norm` | 노루 → 노루페인트 | 1.00 |
| `ALIAS_PREFIX` | 별칭이 개체로 시작/개체가 별칭으로 시작 (2자 이상) | 원익 ← 원 | 0.55 |
| `ALIAS_JAMO_SIMILAR` | 자모 레벤슈타인 정규화 유사도 ≥ 0.6 | 원희 → 원익 | 0.35~0.75 |
| `THEME_DICT` | 개체/개념 → 테마 사전 → 구성 종목 | 폭염 → 빙과 → 빙그레 | 0.70 |
| `SUPPLY_DICT` | 공급망 엣지 1~2홉 | 엔비디아 → HBM → SK하이닉스 | 0.75 |
| `PERSON_DICT` | 인물 → 임원/최대주주 엣지 | 특정 오너 → 지주사 | 0.85 |
| `GRAPH_EXPAND` | 확정된 기업에서 `AFFILIATION` 1홉 | 노루페인트 → 노루홀딩스 | 0.80 |
| `EMBEDDING` | 개체 임베딩 ↔ 개념 임베딩 코사인 ≥ 0.82 (V1.1) | | 0.50 |

**후보 상한 40개.** 초과 시 `recallScore` 기준 절단. 상한이 없으면 "대한"류 개체가 200종목을 끌고 온다.

### 자모 유사도 (밈 연결의 엔진)
```
sim(a,b) = 1 - lev(jamo(a), jamo(b)) / max(len(jamo(a)), len(jamo(b)))
원희 = ㅇㅜㅓㄴㅎㅢ (6)   원익 = ㅇㅜㅓㄴㅇㅣㄱ (7)   lev=3 → sim ≈ 0.57
```
0.6 미만이라도 **첫 음절이 동일**하면 후보로 올린다(`ALIAS_PREFIX` 병합). 한국 밈 연결은 대부분 첫 글자 공유형이다.

## 3. LLM에 주는 후보 정보 (토큰 예산의 핵심)
후보당 다음만 준다. 재무제표·전체 사업보고서는 넣지 않는다.
```
company_id, ticker, name, sector,
business_summary  (DART 기반 1~2문장, 사전 생성·캐시)
path_labels       ["태풍 노루", "노루", "노루페인트"]
recall_rule
```
후보 40개 × 약 60토큰 ≈ 2,400토큰. 뉴스 요약까지 합쳐 입력 3K 이내로 유지한다.

## 4. LLM이 판정하는 것 / 판정하지 않는 것
| 판정한다 | 판정하지 않는다 |
|---|---|
| ACCEPT / REJECT | 주가 방향 |
| `connection_type` (11종 중 1) | 매수·매도 |
| `business_relevance` 0~100 | 목표가 |
| `meme` 0~100 | 시장 반응 점수 (시세 데이터로 코드가 계산) |
| `explanation` 한 줄 | `connection_score` (코드가 계산) |
| `caution` (오해 소지) | |

## 5. 유형 분류 결정 트리 (프롬프트에 그대로 넣음)
```
개체와 회사명이 동일 표기인가?
├ 예 → 그 개체가 그 회사를 가리키는가?
│      ├ 예 → DIRECT / PERSON / PRODUCT 중 실제 관계로
│      └ 아니오(동음이의) → 사업 연관이 있나?
│                          ├ 있음 → DIRECT
│                          └ 없음 → NAME_MATCH  (밈 요소 강하면 meme 점수 높게)
└ 아니오 → 표기가 유사할 뿐인가?
           ├ 예 → MEME
           └ 아니오 → 사업/공급망/테마/지역/인물 중 해당 유형
```
**`MEME`과 `NAME_MATCH`를 골랐다면 `business_relevance`는 반드시 30 이하**여야 한다. 초과 시 파서가 30으로 강등하고 `G4` 위반 기록.

## 6. 반증 검사 (B6, 별도 호출 `counter-check`)
`business_relevance ≥ 60`인 연결에 한해 두 번째 호출을 한다.
> "다음 주장을 **반박**해 보라. 반박에 실패하면 그대로 두라."

입력: 주장 문장 + 해당 기업 사업 개요 + 최근 공시 제목 10개
출력: `{ refuted: boolean, reason: string, adjusted_relevance: 0~100 }`

목적은 낙관 편향 제거다. LLM은 "연결하라"는 맥락에서 무엇이든 연결하려 한다. 반대 방향의 질문을 한 번 던지는 것만으로 오탐이 눈에 띄게 준다.
비용은 전체 후보가 아니라 고득점 소수에만 붙으므로 감당 가능하다.

## 7. 프롬프트 버전 관리
- `prompt_version`은 `connection` 행과 `llm_run`에 남긴다.
- 프롬프트를 바꾸면 **골든셋 회귀를 반드시 돌린다**(`13-validation.md`).
- 롤백은 버전 문자열 교체만으로 가능해야 한다. 프롬프트를 코드에 인라인하지 말 것 — `spec/prompts/`에서 읽는다.
