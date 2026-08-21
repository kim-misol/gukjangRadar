# =============================================================================
# 국장레이더 (Gukjang Radar) — Makefile
# 사용법: make <target>
# 로컬 개발과 CI(.github/workflows/ci.yml)가 같은 타깃을 쓴다 — 여기서 통과하면 CI도 통과한다.
# =============================================================================

.PHONY: help setup install dev web worker \
        up down \
        build typecheck lint format format-check test test-cov \
        check-enum-sync lint-forbidden-words ci golden \
        db-generate db-migrate db-seed db-reset \
        clean

# 기본 타깃: 도움말 출력
help:
	@echo ""
	@echo "  ── 처음 시작한다면 ─────────────────────────────────"
	@echo "  make setup            환경 셋업 (클론 후 1회 실행)"
	@echo ""
	@echo "  국장레이더 개발 명령어"
	@echo ""
	@echo "  ── 개발 ────────────────────────────────────────────"
	@echo "  make install          의존성 설치 (pnpm install)"
	@echo "  make dev              전체 앱 개발 서버 실행 (web + worker)"
	@echo "  make web              웹 서버만 실행 (port 3000)"
	@echo "  make worker           워커 서버만 실행 (port 4000)"
	@echo ""
	@echo "  ── 인프라 ──────────────────────────────────────────"
	@echo "  make up               postgres(pgvector) + redis 기동 (docker compose)"
	@echo "  make down             인프라 중지"
	@echo ""
	@echo "  ── 빌드 & 품질 ─────────────────────────────────────"
	@echo "  make build            전체 앱 빌드"
	@echo "  make typecheck        TypeScript 타입 체크"
	@echo "  make lint             린트 검사 (R5 금지어 린터 포함)"
	@echo "  make format           코드 포맷 (prettier --write)"
	@echo "  make format-check     코드 포맷 검사 (prettier --check)"
	@echo "  make test             유닛 테스트 (전체)"
	@echo "  make test-cov         유닛 테스트 + 커버리지"
	@echo ""
	@echo "  ── 가드레일 (CLAUDE.md 절대 규칙) ──────────────────"
	@echo "  make check-enum-sync     schema.sql ↔ spec/types.ts enum 동기화 검증"
	@echo "  make lint-forbidden-words  R5 금지어 검사 (추천·수혜주 등)"
	@echo "  make ci                CI와 동일한 전체 게이트를 로컬에서 순서대로 실행"
	@echo "  make golden            골든셋 회귀 러너 (실 postgres 필요, .github/workflows/golden.yml과 동일)"
	@echo ""
	@echo "  ── DB (Drizzle) ────────────────────────────────────"
	@echo "  make db-generate      마이그레이션 파일 생성 (drizzle-kit generate)"
	@echo "  make db-migrate       마이그레이션 적용"
	@echo "  make db-seed          시드 데이터 주입"
	@echo "  make db-reset         스키마 초기화 후 마이그레이션 재적용"
	@echo ""
	@echo "  ── 기타 ────────────────────────────────────────────"
	@echo "  make clean            빌드 캐시 및 dist 정리"
	@echo ""

# =============================================================================
# 개발
# =============================================================================

setup:
	@echo ""
	@echo "  ⚙️  국장레이더 개발 환경 셋업"
	@echo ""
	@echo "  [1/5] Node 버전 확인..."
	@node -e "process.exit(parseInt(process.version.slice(1)) >= 20 ? 0 : 1)" \
		|| (echo "         ⚠️  Node 20+가 필요합니다. 현재: $$(node -v)" && exit 1)
	@echo "         ✔ $$(node -v)"
	@echo "  [2/5] 환경 파일 생성..."
	@if [ -f .env ]; then \
		echo "         - .env 이미 존재 (건너뜀)"; \
	else \
		cp .env.example .env && echo "         ✔ .env"; \
	fi
	@echo "  [3/5] 의존성 설치..."
	@pnpm install
	@echo "  [4/5] 인프라 기동 (postgres + redis)..."
	@docker compose up -d || echo "         ⚠️  docker compose 실패. Docker Desktop이 실행 중인지 확인하세요."
	@echo "  [5/5] DB 마이그레이션..."
	@pnpm db:migrate || echo "         ⚠️  DB 연결 실패. 잠시 후 'make db-migrate'를 다시 실행하세요."
	@echo ""
	@echo "  ✅ 셋업 완료!"
	@echo ""
	@echo "  다음 단계:"
	@echo "    make dev              전체 개발 서버 실행 (web + worker)"
	@echo ""
	@echo "  ⚠️  확인 필요:"
	@echo "    .env  → ANTHROPIC_API_KEY, KIS_APP_KEY/SECRET, DART_API_KEY 입력"
	@echo "           (비워둬도 부팅은 되지만 해당 기능은 동작하지 않는다)"
	@echo ""

install:
	pnpm install

dev:
	pnpm dev

web:
	pnpm --filter @gukjang/web dev

worker:
	pnpm --filter @gukjang/worker dev

# =============================================================================
# 인프라
# =============================================================================

up:
	docker compose up -d

down:
	docker compose down

# =============================================================================
# 빌드 & 품질
# =============================================================================

build:
	pnpm build

typecheck:
	pnpm typecheck

lint:
	pnpm lint

format:
	pnpm format

format-check:
	pnpm format:check

test:
	pnpm test

test-cov:
	pnpm test:cov

# =============================================================================
# 가드레일 (CLAUDE.md 절대 규칙)
# =============================================================================

check-enum-sync:
	pnpm check-enum-sync

lint-forbidden-words:
	pnpm lint-forbidden-words

# T4.1(E4.1) — .github/workflows/golden.yml이 부르는 것과 같은 타깃. 실 postgres가 떠 있어야
# 한다(먼저 make db-migrate && make db-seed). ANTHROPIC_API_KEY 없으면 참조 판정기로 돈다.
golden:
	pnpm golden

# CI(.github/workflows/ci.yml)와 완전히 동일한 순서 — 커밋 전 로컬에서 이걸로 먼저 확인한다.
ci: format-check lint typecheck test check-enum-sync lint-forbidden-words
	@echo ""
	@echo "  ✅ 로컬 CI 게이트 전부 통과"
	@echo ""

# =============================================================================
# DB (Drizzle)
# =============================================================================

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

db-seed:
	pnpm db:seed

db-reset:
	pnpm db:reset
	pnpm db:migrate

# =============================================================================
# 기타
# =============================================================================

clean:
	find . -name "dist" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null; true
	find . -name ".turbo" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null; true
	find . -name ".next" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null; true
	find . -name "coverage" -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null; true
	@echo "✅ 빌드 캐시 정리 완료"
