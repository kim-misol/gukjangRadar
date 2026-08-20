# STEP 7. API 설계 원칙

> **계약 원본은 `spec/openapi.yaml`.** 엔드포인트 목록·필드를 이 문서에 복붙하지 말 것.
> 여기에는 yaml에 담기지 않는 *왜*와 *운영 규칙*만 적는다.

## 1. 형태
- REST, JSON, `/v1` 프리픽스. GraphQL 안 쓴다(캐시·CDN이 훨씬 중요).
- Next.js Route Handler가 BFF 역할. 워커(NestJS)는 내부 API만 노출하고 외부에 열지 않는다.
- 커서 페이지네이션(`nextCursor`). offset 금지(피드가 실시간으로 앞에 끼어든다).

## 2. 캐시 전략 (비용의 절반이 여기서 갈린다)
| 엔드포인트 | 캐시 | 이유 |
|---|---|---|
| `GET /v1/home` | `s-maxage=60, SWR=300` | 트래픽 대부분. 1분 지연 허용 |
| `GET /v1/news/{id}` | `s-maxage=120, SWR=600` | 분석 완료 후엔 거의 불변 |
| `GET /v1/news/{id}/graph` | `s-maxage=300` | 무겁고 잘 안 변함 |
| `GET /v1/stocks/{ticker}` | `s-maxage=30` | 시세 포함 |
| `GET /v1/discovery/meme` | `s-maxage=300` | 하루 몇 번 갱신 |
| 알림/피드백 | `no-store` | |

`analysis_status != DONE`인 클러스터는 **캐시 금지**(`no-store`). 안 그러면 스켈레톤이 CDN에 박힌다.

## 3. 응답 규칙
1. 빈 결과는 200 + 빈 배열. 404를 남발하지 않는다.
2. `market`이 null일 수 있다(장 시작 전, 신규 상장, 거래 정지). 클라이언트는 항상 null 처리.
3. 시세를 담은 모든 응답은 `capturedAt` + `isDelayed`를 포함한다. **실시간처럼 보이게 하지 않는다.**
4. `explanation`, `caution`은 서버에서 **금지어 린터를 통과한 문자열만** 내보낸다. 클라이언트에서 필터링하지 않는다.
5. 에러는 `{code, message, detail}` 고정. `code`는 `SCREAMING_SNAKE`.

## 4. 레이트 리밋
| 대상 | 한도 |
|---|---|
| 익명 조회 | IP당 120 req/min |
| 검색 | IP당 30 req/min |
| 제보(`POST /v1/discovery/requests`) | IP당 5/hour, 계정당 20/day |
| 피드백 | 연결당 1회 (DB unique 제약으로 강제) |

## 5. 인증
- 익명 조회 전면 허용(바이럴 유지). 로그인은 알림·저장에만.
- 소셜 로그인(카카오/구글) → JWT(access 15분 / refresh 30일, httpOnly 쿠키).
- 관리자 API는 별도 role 클레임 + IP 허용목록.

## 6. 내부 API (외부 미노출)
```
POST /internal/pipeline/run        { clusterId }      파이프라인 강제 실행
POST /internal/pipeline/rescore    { date, version }  스코어만 재계산
POST /internal/golden/run          { suite }          회귀 테스트
GET  /internal/health              큐 적체·LLM 비용·지연 지표
```
서비스 토큰(`X-Internal-Token`) + VPC 내부에서만 접근.

## 7. 버전 관리
- 파괴적 변경은 `/v2`. 필드 추가는 마이너.
- `scoring_version`, `prompt_version`이 응답에 포함되지는 않지만 `llm_run`에 남는다. 문의 대응 시 이걸로 재현한다.

## 8. OG 이미지
`GET /api/og/connection/{id}` — `@vercel/og`, edge runtime, `s-maxage=86400`.
카드에 반드시 "투자 추천이 아닙니다" 워터마크를 넣는다(공유 시 이미지만 돌아다니므로 고지가 이미지 안에 있어야 한다).
