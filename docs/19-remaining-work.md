# STEP 19. 남은 작업 총정리

> W1~W8 진행 기록(`docs/15-build-order.md`)과 원 기능 목록(`docs/04-mvp-features.md`)을
> 훑어 "미룬 것"/"다음 스텝"/"검증 필요"로 흩어져 있던 항목을 한 곳에 모았다. 실 DB(`psql`)로
> 몇 개는 직접 재확인해 지금도 유효한지 걸러냈다(예: W6이 "그래프에 뉴스 노드가 없다"고
> 적어놨던 건 지금은 75건 있어 더 이상 유효하지 않음 — 그런 건 여기서 뺐다).
>
> **이 문서는 스냅샷이다.** 항목을 해결하면 여기서 지우고 `docs/15-build-order.md`에 진행
> 기록을 남길 것. 새 항목을 미루게 되면 여기에 추가할 것.
>
> 등급(M/S/C/W)은 `docs/04-mvp-features.md` 범례 그대로: **M=V1 필수 · S=V1.1 · C=V2 · W=안 함**.

## 0. 지금 배포를 막고 있는 것 (사람만 할 수 있음)
| 항목 | 내용 |
|---|---|
| 카카오/구글 개발자 콘솔 앱 등록 | `KAKAO_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` 발급 → `.env` |
| Sentry 프로젝트 생성 | `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` |
| 호스팅 결정 | 워커(컨테이너)·Postgres(pgvector)·Redis를 어디에 올릴지 — `docs/18-deployment.md` §4~5 |
| 변호사 검토 | 이용약관/개인정보처리방침 초안 + 유사투자자문업 신고 여부 — T5.6, `docs/01-prd.md §7` |
| 도메인/HTTPS/백업 정책 | 미정 |

## 1. Git / CI — 지금 당장 확인할 것
- **로컬 `main`이 `origin/main`보다 2커밋 앞서 있다(push 안 됨)**: `feat(W6-W7)`, `feat(W8)`.
  즉 `.github/workflows/golden.yml`(PR마다 골든셋 자동 실행 + 코멘트, W7에 만듦)이
  **한 번도 실제로 실행된 적이 없다** — 로컬에서 `pnpm golden`으로만 확인했다. push/PR을
  만들어야 CI가 실제로 도는 걸 처음 확인하게 된다.
- `ci.yml`도 이 리포에서 실제로 GitHub Actions 상에서 통과하는지 아직 못 봤다(로컬
  `make ci`로만 확인).

## 2. M(V1 필수) — 2026-08-21 백로그 정리에서 전부 처리함
`docs/04-mvp-features.md`가 Must로 매긴 항목 중 비어 있던 3개를 우선순위대로 처리했다
(진행 기록: `docs/15-build-order.md` W8 "백로그 정리" 절). 표는 기록으로 남겨둔다 —
각 항목의 "남은 부분"은 §4/§5/§8에 옮겨 적었다.

| ID | 기능 | 등급 | 상태 |
|---|---|---|---|
| B6 | 사업 연관성 반증 검사(T2.3.5) | M | ✅ 구현+실 postgres 검증 완료. `apps/worker/src/connections/counter-check.ts` + `spec/prompts/counter_check.md`(cc-v1). 골든셋 케이스는 아직 없음(§4) |
| A6 | 산업/테마 사전(초기 수기 300~500개) | M | 🔶 `concept` 3→13행, `BELONGS_TO` 엣지 2→19건으로 확장(실 DB에 있는 21개 회사 전부 커버). **300~500개 목표는 여전히 미달** — `company` 테이블이 21개뿐이라(T1.1.1 KRX 수집기가 이 샌드박스에서 막혀 있음, §4) 사전을 더 늘려도 참조할 회사가 없다 |
| D5 | LLM 비용 모니터 | M | ✅ `GET /v1/admin/llm-costs` + `/admin/costs` 페이지, 실 데이터로 확인 완료. SKIPPED(상한 초과로 건너뛴 호출)는 애초에 기록 자체가 안 남아 모니터에도 안 잡힘(§5) |

## 3. S(V1.1)로 이미 정해져 있어 지금 안 만들어도 되는 것 (참고용)
확인만 해두고 지금 손대지 않아도 되는 항목 — 착수 순서에서 혼동 없게 기록.
- A7 공급망 관계 DB 확장(현재 `graph_edge` SUPPLY_CHAIN 2건뿐), B7 과거 유사 사례 매칭,
  B8 임베딩 기반 테마 확장(EMBEDDING recall 룰), C9 개체 허브 `/entity/[id]`,
  C12 저장/북마크, D4 파이프라인 대시보드(지연·실패·비용)
- (C10 사용자 제보는 S등급이지만 이미 W7에서 만들어짐 — 등급보다 먼저 배송된 케이스)

## 4. 코어 파이프라인 — 그 외 미룬 것 (EPIC 1/2)
- **PERSON_DICT 사전 데이터 없음** — 인물→임원/최대주주 매핑. 임원 데이터 자체가 없어 코드
  경로는 있어도 후보가 절대 안 나온다(docs/14 backlog에도 별도 태스크가 없음 — 태스크 자체를
  새로 정의해야 함).
- **canonical_id 동의어 병합 없음**(예: "엔비디아"←"NVIDIA") — `entity.canonical_id` 실 DB
  전부 `NULL`(직접 확인). W4에 "골든셋으로 오탐률을 잴 수 있을 때 다시 붙인다"고 적어놨는데,
  골든셋이 17/17까지 된 지금도 안 돌아왔다.
- **T2.3.8 캐시 무효화(CDN 태그 purge)** — CDN 자체를 아직 안 붙여서 대상이 없음. 실 배포(Vercel)
  붙을 때 같이 볼 것.
- **B-2 시장 이상치 뉴스 소스** — 스키마만 있고 로직 없음(KIS 시세 배치엔 이제 값이 들어오니
  붙일 수 있는 조건은 됨).
- **B-3 DART 실시간 공시 소스** — `disclosure` 테이블 DDL 자체가 없음.
- **C층 뉴스 소스(네이버 검색 등)** — 크레덴셜 없어 클라이언트 미작성.
- **Trends 급상승 키워드 → entity 후보 연결** — fetch/파싱까지만 있고 저장 연결 안 함.
- **연합뉴스·매일경제 RSS가 403** — 이 개발 환경에서도 재현됨(`spec/news_sources.seed.json`에
  `is_active=false`). 실 배포 환경(다른 IP대역)에서 다시 열리는지 재확인 필요.
- **시세 재점수화 배치** — 5분마다 스냅샷은 쌓이는데(`market_snapshot` 실 DB 2건, 장중에만
  쌓임), 그걸로 기존 `connection`을 재점수화하는 BullMQ 잡(`connection.score` 큐) 자체가
  없다. cron 스케줄러(`pipeline-scheduler.service.ts`)에도 등록 안 됨.
- **골든셋에 반증검사(B6) 케이스 없음** — `spec/golden/golden_set.jsonl` 포맷이 MATCH 단계
  (연결 유형 판정)만 테스트하도록 돼 있어, 그 다음 단계인 반증검사를 검증하려면 케이스
  포맷 확장이 먼저 필요하다. 지금은 유닛테스트 6건 + `pnpm manual-verify-counter-check`로만
  커버(§2 B6).
- **A6 산업/테마 사전 추가 확장은 T1.1.1(KRX 전종목 수집)이 먼저 필요** — 지금 21개뿐인
  `company` 테이블을 실 KRX 목록으로 채워야 300~500개 사전이 의미가 생긴다(§2 A6).

## 5. 운영 도구 (EPIC 4) — D4 외
- **T4.4 섀도 모드 실행기** 없음.
- **T4.5 피드백 자동 승격 로직** 없음 — docs/13 §4: "FARFETCHED 40%↑&&표본20↑→자동
  DISPUTED", "WRONG 3건→즉시 노출 중단". 지금은 피드백을 저장만 하고 아무 액션도 안 함.
- **관리자 승인 시 `connection_score` 상한(95) 재계산 안 함** — `computeConnectionScore`가
  필요로 하는 `hasEvidenceGap`/`ambiguousAlias` 플래그가 `connection` 테이블에 저장 안 돼
  있어 일부러 미룸(W8 기록).
- **LLM 호출이 일일 비용 상한으로 건너뛰어진 이벤트가 기록 안 됨** — `build-connections.ts`가
  상한 초과 시 그냥 `continue`해서 `llm_run` 행 자체를 안 남긴다. D5 비용 모니터(§2)도 이
  이벤트는 못 본다 — 별도 기록 지점을 추가해야 한다.

## 6. 화면/UX
- **카테고리 탭 / 정렬 / 검색창(홈 상단) / 스크랩** — docs/17 프로토타입엔 있지만
  `spec/types.ts`/`spec/openapi.yaml`에 대응 계약이 없어 보류(카테고리 taxonomy 자체가 아직
  없음).
- **"지금 뜨는 검색어"/"공시속보" 사이드바** — Trends 저장 연결·disclosure 스키마가 모두
  없어서 보류(§4와 같은 원인).
- **실 모바일 기기에서 그래프 터치 검증** — W6 게이트 원문("모바일 실기기에서 그래프를 손으로
  만져본다")이 아직 미달성. 데스크톱 Playwright로 팬/줌/탭까지만 확인함.
- **`docs/17-screen-design-guide.md` 자체 결함** — 문서가 참조하는 원본 소스
  (`design/main-desktop.dc.html` 등)가 리포 어디에도 없고 캔버스 링크도 죽어 있음. 문서
  정정(참조 제거 또는 소스 복구) 안 함.
- **그래프 노드 `refId`(ENTITY/CONCEPT)가 근사치** — `connection.path`에 정확한 FK가 없어
  그래프 노드 id로 대체 중. C9 개체 허브가 생기면 정확히 채워야 함.
- **`next/font/google` 실 배포 환경 안정성 미확인** — 이 개발 환경(샌드박스)에서는 재시도 끝에
  성공했지만, 이전 주차엔 KRX/DART 같은 외부망이 막혀 있었던 전례가 있어 실 배포 환경에서
  빌드가 안정적인지 별도 확인 필요.

## 7. W8 세부 — 코드는 있지만 좁혀둔 범위
- **레이트리밋 미들웨어 없음** — IP당 조회 120/min, 검색 30/min, 제보 5/hour(docs/07 §4).
  W6→W7→W8 세 번 미뤄짐.
- **BullMQ 잡 단위 Sentry 캡처 없음** — 워커 부팅 실패만 캡처. 개별 파이프라인 잡 실패
  (`'failed'` 이벤트) 캡처는 API를 확인 없이 배선하고 싶지 않아 미룸.
- **분석 이벤트 `card_view` 배선 범위** — 홈 뉴스 카드에만 배선. 발견/검색/종목 상세의
  카드류는 같은 패턴을 반복만 하면 됨(의도적으로 좁혀둠).
- **`connection_review`/관리자 인가가 공유 시크릿(ADMIN_API_TOKEN)** — 운영자가 여러 명이
  되면 `app_user.role` 컬럼 + JWT role 클레임으로 교체해야 함(문서화된 의도적 단순화).

## 8. 미검증 (이 환경의 한계로 확인 못 함)
| 항목 | 사유 |
|---|---|
| `apps/worker/Dockerfile` 실제 빌드 | 이 개발 환경에 Docker 없음 |
| 실 카카오/구글 OAuth 왕복 | CLIENT_ID/SECRET 없음 |
| 실 브라우저 웹푸시 수신(서비스워커가 알림을 실제로 띄우는 것) | 헤드리스 환경, 실 브라우저 없음 |
| 실 Sentry로 에러가 실제로 올라가는지 | DSN 없음 |
| `golden.yml`/`ci.yml`이 실제 GitHub Actions에서 통과하는지 | push 안 됨(§1) |
| 실 모바일 기기 그래프 터치 | 실물 디바이스 없음 |

## 9. 출시 후 첫 4주 (참고, 아직 먼 일)
| 주 | 할 일 |
|---|---|
| +1 | 매일 아침 연결 30건 육안 검수 (`/admin/review`, `onlyFlagged=false`). 이상한 건 골든셋에 추가 |
| +2 | 반증 검사(B6, 2026-08-21 구현 완료 — 이제 "투입"이 아니라 "실 트래픽으로 refuted 비율 관찰") BR 고득점 정확도 개선 |
| +3 | 피드백 데이터로 가중치 튜닝 (rescore만, LLM 재호출 없음) |
| +4 | 유료화 법률 검토 착수 + 과거 유사 사례(B7) 기능 |
