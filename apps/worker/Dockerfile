# T5.5 — apps/worker 배포 스캐폴딩 (docs/15 W8, 호스팅 대상 미정: Railway/Fly.io/Render 등
# Dockerfile을 받는 곳이면 어디든 이 이미지로 띄울 수 있다).
#
# 빌드 컨텍스트는 반드시 저장소 루트여야 한다(pnpm workspace 전체가 필요하므로):
#   docker build -f apps/worker/Dockerfile -t gukjang-worker .
#
# packages/core·packages/db·spec가 package.json의 "exports"를 소스(.ts)로 직접 가리키는
# 모노레포 설계라(빌드된 dist를 게시하지 않음, docs/15 W8 진행 기록) apps/worker도 컴파일된
# JS가 아니라 tsx로 소스를 직접 실행한다 — apps/worker/package.json의 "start" 스크립트와
# 동일하다. 이미지가 tsx(런타임)까지 포함해 조금 더 크지만, dev와 정확히 같은 경로로
# 돌기 때문에 "빌드에서만 나는 버그"가 없다.
FROM node:20-slim AS base
WORKDIR /repo
RUN corepack enable

# 의존성 레이어 — package.json들만 먼저 복사해 소스 변경 시에도 캐시를 재사용한다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY spec/package.json spec/package.json
RUN pnpm install --frozen-lockfile --prod --filter @gukjang/worker...

# 소스 복사
COPY apps/worker apps/worker
COPY packages/core packages/core
COPY packages/db packages/db
COPY spec spec

ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@gukjang/worker", "start"]
