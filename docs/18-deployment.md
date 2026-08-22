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

**DB/Redis 프로비저닝 (2026-08-22)**: Vercel Marketplace로 Neon Postgres(`vercel integration add
neon`) + Upstash Redis(`vercel integration add upstash/upstash-kv`)를 붙였다. 프로젝트에 이미
`DATABASE_URL`/`REDIS_URL`이 등록돼 있으면(플레이스홀더라도) `vercel integration resource connect`가
"already has an existing environment variable" 400으로 실패하니 먼저 `vercel env rm`으로 지운 뒤
연결해야 한다. Upstash는 첫 설치 시 브라우저에서 마켓플레이스 약관 동의가 필요하다(`--non-interactive`론
못 넘어감, `verification_uri`를 사람이 직접 열어야 함). `vercel env pull --environment production`으로
받은 값 중 "Sensitive" 타입으로 등록된 변수(`JWT_SECRET`/`NODE_ENV`/`NEXT_PUBLIC_API_BASE_URL` 등)는
`[SENSITIVE]`로 마스킹돼 내려오므로, 로컬에서 프로덕션 DB에 마이그레이션/시드를 돌릴 때는 필요한
값(`DATABASE_URL` 등)만 골라서 export하고 나머지는 로컬 placeholder로 채워야 한다.

**서버리스 함수 개수 제한 (2026-08-22 발견, 미해결)**: `apps/web`은 API 라우트 25개 + 동적 페이지
11개, 총 **36개의 서버리스 함수**를 만든다. Vercel Hobby 플랜은 배포당 12개까지만 허용해
`vercel deploy --prod`가 "No more than 12 Serverless Functions can be added to a Deployment on
the Hobby plan"으로 실패한다. 오늘 백로그 커밋들로 라우트가 계속 늘면서 이 한계를 넘긴 것으로
보이고, 그 이후 배포 시도(CLI/git-integration 모두)가 전부 실패해 프로덕션은 더 예전의,
함수 수가 더 적었던 마지막 성공 빌드를 계속 서빙 중이다. 해결책은 Pro 플랜 업그레이드(즉시,
과금) 또는 API 라우트를 도메인별 catch-all로 통합하는 리팩터링(무료, 회귀 위험 있는 작업) 중
하나 — `docs/19-remaining-work.md` §0 참고, 결정 보류 중.

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

**apps/web용은 해결됨(2026-08-22)**: Neon Postgres(pgvector 지원 확인) + Upstash Redis를
Vercel Marketplace로 프로비저닝, `gukjang-radar-web` 프로젝트에 연결·마이그레이션까지 완료
(§2 참고). **apps/worker(컨테이너)가 쓸 DATABASE_URL/REDIS_URL은 아직 별도로 안 정했다** —
지금은 같은 Neon/Upstash 인스턴스를 공유해도 되는지, 워커 전용으로 따로 둘지 결정 필요.
Redis는 BullMQ 지속성 요건(AOF/RDB)을 지원해야 하는데 Upstash Redis가 이걸 충족하는지
확인 안 됨. 백업 주기·보존기간도 아직 정의 안 했다.

## 5. 남은 결정 (사용자 몫)

- 워커(컨테이너)를 어디에 올릴지, 워커용 DB/Redis를 apps/web과 같은 Neon/Upstash로 묶을지 분리할지
- Vercel Hobby 12-함수 제한 — Pro 업그레이드 vs API 라우트 통합 리팩터링 (§2, `docs/19` §0)
- Sentry/카카오/구글 개발자 콘솔 계정 생성 및 실 크리덴셜 발급
- 커스텀 도메인, HTTPS, DNS
- 백업 정책

T5.6(자본시장법 검토 체크리스트)과 마찬가지로 이 항목들은 실제 배포 전 확정이 필요하다.
