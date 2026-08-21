# STEP 16. 뉴스 소스 — 실시간 이슈를 어디서 어떻게 가져오나
> W3(E2.1 · T2.1.1)에서 쓰는 문서. 시드 데이터: `spec/news_sources.seed.json`
> 검증일: 2026-08-20. 피드는 예고 없이 바뀐다 — 분기마다 재검증할 것.

## 0. 결론부터

**"실시간 이슈 뉴스"를 한 번에 주는 소스는 없다.** 성격이 다른 세 종류를 교차시켜야 한다.

| 층 | 답하는 질문 | 소스 | 폴링 |
|---|---|---|---|
| **A. 뉴스 스트림** | 지금 무엇이 *보도*되었나 | 언론사 RSS 직접 구독 | 60~120s |
| **B. 이슈 신호** | 지금 무엇이 *터졌나* | Google Trends KR RSS · 시장 이상치 · DART 공시 | 5m / 5m / 60s |
| **C. 보강 검색** | 그 이슈의 기사를 더 | 네이버 뉴스 검색 API (`sort=date`) | 신호 발생 시 |

A만 쓰면 "이슈화"를 못 잡는다(전량 스트림이라 무엇이 뜨는지 모른다).
B만 쓰면 기사가 없다(키워드만 있다).
**A × B 교차가 이 서비스의 진입점이다.** 특히 B의 Google Trends는 ④이름·⑤밈 레이어와 궁합이 최고다 — "원희"류 인물이 급상승 검색어에 뜨는 그 순간이 바로 우리가 잡아야 할 시점이고, 경제지 RSS만 보고 있으면 절대 못 잡는다.

---
## 1. A층 — 언론사 RSS (주 수집 경로)

### 왜 RSS 직접 구독인가
- **전량 스트림**을 준다. 검색 API는 쿼리를 알아야 하지만 RSS는 "다 주세요"가 된다.
- 무료, 인증 불필요, 발행 즉시.
- 매체를 우리가 고른다 → `news_source.tier`로 신뢰도를 우리가 통제.

### 이 환경에서 실제로 검증한 피드 (2026-08-20)
| 매체 | URL | 결과 |
|---|---|---|
| 이데일리 (증권) | `https://rss.edaily.co.kr/stock_news.xml` | ✅ 50건. `title/link/description/category/author/pubDate` |
| 한국경제 (금융) | `https://www.hankyung.com/feed/finance` | ✅ 50건. 당일 09:44 갱신 확인 |
| SBS (경제) | `https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02` | ✅ `content:encoded`, `media:thumbnail` 포함 |
| 연합뉴스 (경제) | `https://www.yna.co.kr/rss/economy.xml` | ⚠️ 이 샌드박스 프록시에서 403. **피드가 죽은 게 아니라 우리 쪽 차단일 수 있음** — 실 네트워크에서 재확인 |
| 매일경제 | `https://www.mk.co.kr/rss/30100041/` | ⚠️ 동일 (403, 재확인 필요) |
| **구글 뉴스 RSS** | `news.google.com/rss/...` | ❌ **robots.txt가 금지한다. 쓰지 말 것.** |

> 구글 뉴스 RSS는 국내 블로그에 흔히 소개되지만 robots.txt에서 막혀 있다. 편의를 위해 무시하면 나중에 서비스 전체의 리스크가 된다.

### 수집기 규칙 (`apps/worker/src/collectors/rss.ts`)
```
- 매체당 요청 간격 ≥ 1s, 전역 동시성 ≤ 4
- ETag / If-Modified-Since 캐시 → 304면 파싱 스킵 (대역폭·CPU 90% 절감)
- User-Agent에 서비스명과 연락처를 명시한다 (차단당했을 때 협의 창구가 된다)
- robots.txt를 기동 시 1회 확인하고 캐시. Disallow면 소스 자동 비활성화
- 파싱 실패/스키마 이상은 소스를 죽이지 말고 `news_source.error_count`만 올린다
- 연속 실패 10회 → `is_active=false` + 알람
```

### 필드 매핑
| RSS | `news_article` |
|---|---|
| `title` | `title` (정규화 후) |
| `link` | `url` (canonical 정규화: 쿼리 정렬·트래킹 파라미터 제거) |
| `pubDate` | `published_at` (KST 파싱, 미래 시각은 now로 클램프) |
| `description` | `lead` **200자 절단, 요약 생성 후 파기** ← D5 |
| 없음 | `simhash(title)` |

**`description`을 그대로 보관하지 않는다.** 요약 프롬프트 입력으로 쓰고 버린다. 이게 PRD D5의 실제 구현 지점이다.

---
## 2. B층 — 이슈 신호

### B-1. Google Trends 실시간 급상승 (핵심)
```
GET https://trends.google.com/trending/rss?geo=KR
```
- **인증 불필요, 무료, 검증 완료 ✅**
- 응답: 10개 항목. 각 항목에
  - `title` — 급상승 검색어
  - `ht:approx_traffic` — `200+`, `500+`, `1000+`, `5000+`
  - `ht:news_item` × 약 3 — 관련 기사 제목·URL·매체
  - `pubDate`, `ht:picture`
- 실제 응답 예(2026-08-20): `s&p 500`, `오현규`, `vix`, `다우 존스 산업평균지수`, `미사일`

이게 왜 결정적인가: **급상승 검색어는 곧 개체(entity) 후보다.** `오현규`, `미사일` 같은 항목이 그대로 STEP 8의 개체 추출을 건너뛰고 후보 검색(⑧)에 바로 들어갈 수 있다. 게다가 `ht:news_item`이 기사 링크를 3개씩 딸려 준다 — A층이 놓친 매체의 기사도 여기서 들어온다.

폴링 5분. 변화가 있을 때만 `discovery_request`와 유사한 내부 큐에 넣는다.

> 참고: Google Trends 공식 API는 2025년 알파로 공개됐고 접근 신청이 필요하다. RSS는 지금 당장 쓸 수 있는 경로이지만 비공식이라 **언제든 형식이 바뀔 수 있다** — 파서를 방어적으로 짜고, 실패해도 A층이 계속 돌게 격리할 것.

### B-2. 시장 이상치 (이미 있는 데이터의 재활용)
W7의 KIS 시세 배치(`market_snapshot`)에서:
```
volume_ratio20 ≥ 3.0  또는  |change_pct| ≥ 8  →  '이슈 발생' 신호
```
→ 해당 종목명으로 C층 검색을 돌려 이유가 될 뉴스를 찾는다.
**이게 J2(관찰형 사용자)의 "이거 왜 올랐어?" 진입점이자, 우리 엔진의 재현율 자가 측정 장치다.** 급등했는데 연결을 못 찾은 종목 수가 곧 우리가 놓친 이슈의 개수다.

### B-3. DART 실시간 공시 (뉴스보다 빠르고 저작권 청정)
```
GET https://opendart.fss.or.kr/api/list.json
    ?crtfc_key=...&bgn_de=YYYYMMDD&end_de=YYYYMMDD&corp_cls=Y&page_count=100&sort=date&sort_mth=desc
```
- 응답: `rcept_no`(14자리 접수번호), `corp_name`, `stock_code`, `report_nm`, `rcept_dt`
- 원문 링크: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}`
- 호출 제한: 일 20,000건 수준. 60초 폴링이면 하루 1,440회라 여유.
- **저작권 문제가 없다.** 공시는 공공 정보다. 뉴스와 달리 본문을 보관해도 된다.

공시는 `news_cluster`가 아니라 별도 `disclosure` 소스로 다루되, 파이프라인 ⑥ 이후는 뉴스와 동일하게 태운다. `corp_cls=Y`(유가)와 `K`(코스닥)를 각각 폴링.

---
## 3. C층 — 네이버 뉴스 검색 API (보강 전용)

```
GET https://openapi.naver.com/v1/search/news.json?query=...&display=100&sort=date
헤더: X-Naver-Client-Id / X-Naver-Client-Secret
```

| 항목 | 값 |
|---|---|
| `display` | 1~100 |
| `start` | 1~1000, 그리고 **`start + display - 1 ≤ 1000`** |
| `sort` | `sim`(정확도) / `date`(최신) |
| 일 한도 | **25,000회 — 전 검색 카테고리 공유** |
| 응답 | `title`, `description`(둘 다 `<b>` 태그 포함 → 제거 필요), `link`, `originallink`, `pubDate` |

### 이걸 스트림으로 쓸 수 없는 이유
검색 API다. 쿼리 없이 "최신 뉴스 전부"를 받을 수 없고, 한 쿼리당 최대 1,000건까지만 페이징된다.
"주식", "증시" 같은 광범위 쿼리로 우회하는 방법이 돌아다니지만 결과가 편향되고 한도만 태운다.

### 올바른 용법
B층 신호가 발생했을 때만 호출한다.
```
Trends 급상승 10개 × 5분 주기 (변화분만) ≈ 1,000~2,000회/일
시장 이상치 종목 30개 × 1회        ≈    30회/일
사용자 제보 키워드                  ≈   수백회/일
────────────────────────────────────────────
합계 3,000회 미만 → 25,000 한도 대비 충분
```
`originallink`(원 매체 URL)를 canonical로 삼아 A층과 중복 제거한다. `link`(네이버 뉴스 URL)를 키로 쓰면 같은 기사가 두 번 들어온다.

> 상업 서비스에 쓰기 전 네이버 오픈API 이용약관과 출처 표기 의무를 확인할 것. 문서상 한도와 별개로 약관이 용도를 제한할 수 있다.

---
## 4. 쓰지 않기로 한 것

| 소스 | 이유 |
|---|---|
| 구글 뉴스 RSS | robots.txt 금지 |
| 웹 크롤링(포털 뉴스 페이지 직접 파싱) | 약관 위반 + 차단 + 저작권. 하지 않는다 |
| 빅카인즈 Open API | 신청·승인 기반이고 기관/연구 이용 중심. **실시간 파이프라인에는 부적합.** 단 **과거 데이터 백필과 골든셋 구축에는 최고의 자원** — W5 전에 신청해 둘 것 |
| 유료 실시간 뉴스 단말(연합인포맥스·인포스탁 등) | 품질은 최상이나 월 비용이 MVP 단계에 과하다. PMF 확인 후 재검토 |
| X(트위터) API | 유료 전환 후 비용 대비 효용 낮음 |

---
## 5. 저작권·약관 체크리스트 (T2.1.1 DoD에 포함)

- [ ] 기사 **본문을 저장하지 않는다.** `description`/`lead`는 요약 생성 후 파기
- [ ] 제목 + 원문 링크 + 매체명만 노출. 클릭 시 **원 매체로 보낸다**(프레임 안에 가두지 않는다)
- [ ] AI 요약은 3문장, **원문 연속 인용 20자 초과 금지** (린터로 강제)
- [ ] 이미지 핫링크·재호스팅 금지. 썸네일이 필요하면 자체 생성
- [ ] robots.txt 준수, User-Agent에 연락처 명시
- [ ] 매체별 삭제·제외 요청 창구를 `/legal/disclaimer`에 명시하고 24시간 내 반영
- [ ] `news_source`에 `terms_checked_at`, `terms_note` 컬럼을 두고 확인 이력을 남긴다

> 사실 전달에 그치는 시사보도는 저작물성이 부정될 수 있다는 논의가 있지만, 그 경계는 개별 기사마다 다르다. **"제목+링크만"을 지키는 것이 가장 확실한 방어선이고, 우리 제품은 그것만으로 충분히 동작한다.**

---
## 6. 스키마 보강 (마이그레이션 필요)

`news_source`에 다음을 추가한다:
```sql
ALTER TABLE news_source
  ADD COLUMN kind            text NOT NULL DEFAULT 'RSS',   -- RSS | TRENDS | DART | NAVER_SEARCH | MARKET
  ADD COLUMN poll_interval_s int  NOT NULL DEFAULT 120,
  ADD COLUMN etag            text,
  ADD COLUMN last_modified   text,
  ADD COLUMN last_polled_at  timestamptz,
  ADD COLUMN error_count     int  NOT NULL DEFAULT 0,
  ADD COLUMN terms_checked_at date,
  ADD COLUMN terms_note      text;
```
`spec/schema.sql`도 같은 커밋에서 갱신할 것(CLAUDE.md §4).

---
## 7. W3 게이트 재정의

기존 게이트(기사 3,000건 → 클러스터 200건 이하)에 **두 줄을 추가**한다:

1. Google Trends 급상승 키워드가 5분 주기로 들어오고, 그중 국내 상장사와 연결 가능한 후보가 하루 1건 이상 나온다.
2. A층 RSS와 C층 네이버 검색 결과가 `originallink` canonical로 **중복 없이** 병합된다.

1번이 안 되면 이 서비스는 "어제 뉴스 정리 앱"이 된다. 실시간성은 A층이 아니라 B층에서 나온다.
