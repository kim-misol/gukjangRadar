# 국장레이더 — 설계 문서 패키지

뉴스와 국내 상장 종목 사이의 **숨은 연결고리를 발견**하는 AI 서비스의 STEP 1~15 설계.

## 코딩 에이전트로 이어서 개발할 때
1. 이 폴더 전체를 새 저장소 루트에 넣는다.
2. Claude Code / Cursor 첫 프롬프트:
   > `CLAUDE.md`를 읽고, `docs/15-build-order.md`의 W1부터 시작해줘. 필요한 문서는 `docs/00-index.md` 라우팅 표를 보고 그때그때 골라 읽어.
3. `CLAUDE.md`는 항상 컨텍스트에 두고, 나머지는 작업할 때만 읽게 한다.

## 구조
```
CLAUDE.md                 항상 로드하는 프로젝트 헌법 (절대 규칙 R1~R7, 스택, 용어)
docs/00-index.md          작업 유형별 문서 라우팅 표 ← 여기부터
docs/01~15                STEP 1~15 설계 문서
spec/schema.sql           DDL (PostgreSQL 16, 실제 파서로 검증 완료)
spec/types.ts             모든 enum·DTO 단일 진실 원천 (tsc --strict 통과)
spec/openapi.yaml         API 계약 (16 endpoints, $ref 전부 해석됨)
spec/scoring.config.json  스코어링 가중치 (코드에 하드코딩 금지)
spec/prompts/             LLM 프롬프트 원본 (버전 관리)
spec/golden/              회귀 테스트 정답셋
```

## 이 설계의 한 줄 요약
**LLM은 종목을 만들지 않는다.** 후보는 결정론적 그래프 탐색이 만들고, LLM은 그 안에서만 판정한다.
