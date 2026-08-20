# STEP 8. AI Entity Extraction — 설계

> 프롬프트 원본: `spec/prompts/entity_extraction.md` (버전 `ee-v1`)

## 1. 이 단계의 유일한 임무
뉴스에서 **개체를 뽑는 것까지만** 한다. 기업을 떠올리게 하지 않는다.
→ 프롬프트에 상장사 목록을 절대 넣지 않는다. 넣는 순간 LLM이 "노루페인트"를 개체로 환각한다.

## 2. 입력
```
headline        대표 기사 제목
summary         3문장 AI 요약 (동일 배치에서 먼저 생성)
source_titles   같은 클러스터의 다른 기사 제목 최대 5개 (표현 다양성 확보)
published_at    발행 시각
```
본문은 넣지 않는다(저작권 + 토큰 비용 + 노이즈).

## 3. 출력 (tool_use JSON schema로 강제)
개체당: `surface`(원문 표기), `normalized`, `kind`, `subtype`, `importance`(0~1), `in_headline`, `role`, `aliases`(뉴스 안에서의 다른 표기).

## 4. 핵심 규칙 (프롬프트에 명시)
| # | 규칙 | 이유 |
|---|---|---|
| E1 | **고유명사는 잘게 쪼개서도 함께 낸다.** "태풍 노루" → `태풍 노루`(EVENT) + `노루`(WORD, subtype=TYPHOON_NAME) | ④이름·⑤밈 레이어는 쪼갠 조각에서만 나온다. 이게 이 서비스의 생명줄이다. |
| E2 | 한자·영문·약칭 표기를 `aliases`에 함께 | 매칭 재현율 |
| E3 | `importance`는 **뉴스 안에서의 중요도**. 주가 영향 추정 아님 | 역할 혼동 방지 |
| E4 | 기업명이 뉴스에 직접 나오면 `kind=ORG`로 낸다. 단 상장 여부는 판단하지 않는다 | 판단은 결정론 단계에서 |
| E5 | 숫자·날짜·기자명·매체명·상투어("~할 전망")는 추출하지 않는다 | 노이즈 |
| E6 | 개체 0개면 빈 배열. 억지로 채우지 않는다 | R1 |

## 5. E1이 왜 결정적인가
`태풍 노루`만 뽑으면 `노루페인트`는 영원히 안 나온다. 문자열 부분 일치를 검색 단계에서 하면 "대한"·"한국"·"신라" 같은 흔한 조각이 폭발한다.
→ **LLM이 "의미 있는 분해 단위"를 판단해서 조각을 만들고**, 조각마다 `subtype`(태풍명·아이돌 멤버명·지역명…)을 달아 준다. 그 subtype이 뒤에서 오탐 억제에 쓰인다.

예:
```
"태풍 노루 북상"      → 태풍 노루(EVENT) / 노루(WORD·TYPHOON_NAME) / 기상청(ORG)
"리센느 원희 화제"     → 리센느(ORG·IDOL_GROUP) / 원희(PERSON·IDOL_MEMBER)
"엔비디아 신제품 발표"  → 엔비디아(ORG) / GPU(PRODUCT) / 신제품 발표(EVENT)
"기록적 폭염"          → 폭염(EVENT·WEATHER) / 전력수요(WORD)
```

## 6. 개체 정규화·병합
LLM 출력 후 결정론 단계에서:
1. `normalized` = 공백/특수문자 제거 + NFC
2. `name_jamo` = 자모 분해 (한글 편집거리용)
3. 기존 `entity`와 `(name_norm, kind)` 일치 시 재사용, 아니면 생성
4. `canonical_id`로 동의어 병합 (예: `엔비디아` ← `NVIDIA`, `엔디비아`(오타))
5. 불용 개체 블랙리스트(`entity_stoplist`) 적용: 정부, 대통령실, 국회, 코스피, 코스닥, 증권가 등 매일 나오는 것들

## 7. 캐시
`input_hash = sha256(headline + summary + prompt_version)`. 동일 해시는 `llm_run`에서 재사용.
같은 사건이 재보도될 때 비용이 0이 된다. 국내 뉴스 특성상 히트율이 높다(30~50% 기대).

## 8. 실패 처리
| 상황 | 처리 |
|---|---|
| JSON 파싱 실패 | 1회 재시도(temperature 0) → 실패 시 `analysis_status=FAILED`, 뉴스만 노출 |
| 개체 20개 초과 | `importance` 상위 20개만 저장 |
| 응답 지연 > 20s | 타임아웃, 다음 배치로 이월 |
