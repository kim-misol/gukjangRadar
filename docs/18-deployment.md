# STEP 18. 배포 (T5.5)

> W8에 스캐폴딩만 했다(실제 계정 생성·배포 실행 없음, docs/15-build-order.md W8 참고).
> 이 문서는 "무엇이 준비돼 있고 무엇이 남았는지"를 적는다 — 실행 방법 자체는
> 각 호스팅 서비스 문서를 따른다.
## 1. 구성 요소별 배포 대상

| 구성 요소 | 대상 | 상태 |
|---|---|---|
| `apps/web` (Next.js) | Vercel | `vercel.json` 스캐폴딩 완료 |
| `apps/worker` (NestJS + BullMQ) | 컨테이너 호스팅 (Railway/Fly.io/Render 등, 미정) | `Dockerfile` 스캐폴딩 완료 — **Docker 빌드 자체는 이 개발 환경에 Docker가 없어 미검증** |
| PostgreSQL 16 + pgvector | 미정 (Neon/Supabase/Railway Postgres 등) | 미착수 |
| Redis (BullMQ 큐) | 미정 | 미착수 |
| 백업 | 미정 | 미착수 |

`apps/worker`는 Vercel 서버리스에 올릴 수 없다 — BullMQ 워커는 상시 실행 프로세스가 필요하다.

## 2. apps/web (Vercel)

루트 `vercel.json`이 pnpm 모노레포용 빌드 커맨드를 지정한다:
```json
{
  "buildCommand": "pnpm --filter @gukjang/web build",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": ".next"
}
```
**Root Directory는 `apps/web`으로 설정한다** (저장소 루트가 아니다 — 이 문서에 예전에 반대로
적혀 있었으나 실제 배포 세션에서 틀린 것으로 확인됨, 아래 "실제 배포로 확인한 것" 참고).
`vercel.json`의 `outputDirectory`는 이제 Root Directory(`apps/web`) 기준 상대경로인 `.next`로
맞춘다. `apps/web/next.config.ts`가 `@gukjang/core`/`@gukjang/spec`를 `transpilePackages`로
직접 번들링하므로(두 패키지는 `dist`가 아니라 소스를 바로 가리킨다, `packages/*/package.json`의
`exports`) 별도 빌드 단계 없이 `next build` 하나로 끝난다 — 이번 세션에 여러 번 실제로 확인함.

**실제 배포로 확인한 것 (2026-08-22 세션)**: Vercel에 실제로 import해서 세 번 배포를 돌려봄.
1. Root Directory를 저장소 루트로 두면 Framework Preset이 자동으로 "Other"가 되고, 빌드 자체는 성공하지만 `.next` 산출물을 정적 파일로만 서빙해 모든 페이지가 `404: NOT_FOUND`로 뜬다 (서버 렌더링이 전혀 동작 안 함 — Next.js 런타임/서버리스 함수가 아예 안 만들어짐).
2. Framework Preset을 수동으로 "Next.js"로 바꿔도 Root Directory가 저장소 루트인 채로는 "No Next.js version detected" 빌드 에러가 난다 — 저장소 루트 `package.json`엔 `next` 의존성이 없기 때문(모노레포 특성상 `apps/web/package.json`에만 있음).
3. Root Directory를 `apps/web`으로 바꾸면 Framework Preset이 자동으로 "Next.js"로 감지되고, `vercel.json`의 `outputDirectory`도 `.next`(Root Directory 기준)로 맞춰야 산출물을 찾는다 — `apps/web/.next`로 남겨두면 `apps/web/apps/web/.next`를 찾다가 빌드가 실패한다.
결론: Root Directory=`apps/web` + `outputDirectory: ".next"` 조합이 유일하게 동작을 확인한 설정.

필요한 환경변수(Vercel 프로젝트 설정에 등록): `DATABASE_URL`, `JWT_SECRET`,
`KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`VAPID_PUBLIC_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `ADMIN_API_TOKEN`,
`NEXT_PUBLIC_SITE_URL`(배포 도메인), `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`(선택) —
전체 목록은 `.env.example` 참고.

## 3. apps/worker (컨테이너)

`apps/worker/Dockerfile`이 이미지를 만든다. 빌드 컨텍스트는 **저장소 루트**여야 한다
(pnpm workspace 전체가 필요):
```
docker build -f apps/worker/Dockerfile -t gukjang-worker .
docker run --env-file .env -p 4000:4000 gukjang-worker
```

**중요한 설계 선택**: 이 모노레포는 `packages/core`/`packages/db`/`spec`의 `package.json`
`exports`가 컴파일된 `dist`가 아니라 **소스(.ts)를 직접** 가리킨다(퍼블리시하지 않고 항상
소스로 돌리는 설계). 그래서 `apps/worker`도 `tsc`로 컴파일한 `dist/main.js`를 `node`로
바로 실행할 수 없다 — Node의 ESM 로더가 확장자 없는 상대 경로(`./app.module`)를 못 찾고,
설령 그걸 고쳐도 `@gukjang/core` 자체가 `.ts`라 plain node가 못 읽는다. **이번 세션에 실제로
`node dist/main.js`를 돌려서 `ERR_MODULE_NOT_FOUND`로 깨지는 것을 확인**했다. 고친 방법:
`apps/worker`의 `start` 스크립트를 `node dist/main.js` 대신 `tsx src/main.ts`로 바꿔
`dev`와 동일한 경로로 프로덕션도 돌게 했다(`tsx`를 devDependencies에서 dependencies로 이동).
이미지가 조금 더 크지만 "빌드에서만 나는 버그"가 없다. `pnpm --filter @gukjang/worker start`로
실제 기동 확인(`/health` 200)까지 마침.

필요한 환경변수: `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `KIS_APP_KEY`/
`KIS_APP_SECRET`/`KIS_ACCOUNT_NO`, `DART_API_KEY`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
`VAPID_SUBJECT`, `SENTRY_DSN`(선택).

## 4. DB / Redis / 백업

호스팅 대상 미정. 결정 기준: `pgvector` 확장을 지원해야 한다(company/entity 임베딩,
`spec/schema.sql`). Redis는 BullMQ 지속성 요건(AOF/RDB)을 지원하는 곳이어야 한다.
백업 주기·보존기간은 아직 정의 안 함 — 실제 호스팅을 정할 때 같이 정한다.

## 5. 남은 결정 (사용자 몫)

- 워커/DB/Redis를 어디에 올릴지(Railway 단일 플랫폼으로 묶을지, 서비스별로 나눌지)
- Sentry/카카오/구글 개발자 콘솔 계정 생성 및 실 크리덴셜 발급
- 커스텀 도메인, HTTPS, DNS
- 백업 정책

T5.6(자본시장법 검토 체크리스트)과 마찬가지로 이 항목들은 실제 배포 전 확정이 필요하다.
