# STEP 10. Connection Scoring Algorithm

> 파라미터 원본: `spec/scoring.config.json` (버전 `sc-v1`)
> 구현 위치: `packages/core/scoring/` — **순수 함수, IO 없음, 단위 테스트 100% 목표**

## 0. 대전제
`connection_score`는 **"이 뉴스와 이 종목이 얼마나 강하게 연결되어 있는가"** 이다.
수익률·상승 확률이 아니다. 필드 설명, 툴팁, 문서 어디에도 그렇게 쓰지 않는다.

## 1. 6개 점수
| 점수 | 산출 | 범위 |
|---|---|---|
| `businessRelevance` | LLM 판정 + 반증 검사 보정 | 0~100 |
| `keywordMatch` | 결정론 (문자열/자모) | 0~100 |
| `supplyChain` | 결정론 (경로상 SUPPLY_CHAIN 엣지 weight) | 0~100 |
| `marketReaction` | 결정론 (거래량·등락률) | 0~100 |
| `meme` | LLM + 결정론 혼합 | 0~100 |
| `confidence` | min(경로 엣지 confidence) × LLM confidence | 0~100 |

## 2. keywordMatch
```
exact alias 일치            → 100 × aliasTypeMultiplier[alias_type]
자모 유사(sim ≥ 0.60)       → round(100 × sim) × aliasTypeMultiplier
첫 음절 동일                → +12 (firstSyllableBonus)
alias.is_ambiguous          → −25
개체 길이 1자               → −40 (한 글자 매칭은 거의 항상 잡음)
경로에 이름 관련 엣지 없음   → 0
결과는 0~100 클램프
```
`원희 → 원익`: sim 0.57 → 유사도 미달이나 첫 음절 동일로 후보 진입, KM = round(57)+12 = 69, 별칭 OFFICIAL ×1.0 → **69**.
`노루 → 노루페인트`: SHORT 별칭 완전 일치 → 100 × 0.95 = **95**.

## 3. marketReaction
```
vol  = clamp(0,100, 25 × log2(max(volumeRatio20, 0.25)) + 50)
price= clamp(0,100, 2.5 × |changePct| + 50)
MR   = round(0.6 × vol + 0.4 × price)
```
- 거래량 20일 평균의 4배 → vol=100. 평균 수준 → 50.
- **등락률은 절댓값**을 쓴다. 급락도 "시장이 반응했다"는 사실이다. 방향은 별도 필드로 표시한다.
- 시세 없음(장 시작 전·거래정지·신규상장) → `MR = null`, 프로파일 가중치를 나머지로 **재정규화**한다. 0으로 넣으면 아침 뉴스가 전부 저평가된다.

## 4. meme
```
ME = clamp(0,100, 0.5 × meme_llm + 0.3 × (100 − businessRelevance) + 0.2 × MR)
if connection_type == 'MEME': ME = max(ME, 50)
```
밈은 "사업 연관이 없는데 시장이 반응했다"가 본질이므로 BR의 역수와 MR이 들어간다.

## 5. confidence
```
CF = round( min(edge.confidence for edge in path) × (llm_confidence / 100) × 100 )
```
경로가 길수록 자연히 낮아진다(가장 약한 고리가 결정).

## 6. connection (최종)
```
profile   = NOMINAL if type ∈ {NAME_MATCH, KEYWORD, MEME} else BUSINESS
base      = Σ weights[k] × score[k]          (null 점수는 가중치 재정규화)
confFac   = 0.6 + 0.4 × (CF / 100)
hopFac    = max(0.70, 1 − 0.08 × (hopCount − 1))
raw       = base × confFac × hopFac
score     = round(clamp(0, 100, raw))

// 상한(cap) 적용
if 경로에 evidence 없는 엣지 존재      → score = min(score, 60)
if 별칭이 is_ambiguous               → score = min(score, 80)
if 미검수 && score > 95              → score = 95
```

### 왜 프로파일을 나눴나 (중요)
단일 가중치(BR 40%)를 쓰면 `노루페인트`(BR=10)는 base가 30점대로 눌린다. 그러면 **이 서비스의 대표 사례가 목록 하단에 처박힌다.**
이름·밈 연결은 애초에 다른 축의 현상이므로 다른 잣대로 정규화해야 한다.
대신 UI는 두 축(사업 연관성 × 화제성)을 **분리 표시**하므로 사용자가 둘을 혼동하지 않는다(R4).

## 7. relevanceBand
`businessRelevance` 기준: ≥70 `HIGH` / ≥40 `MEDIUM` / ≥15 `LOW` / 그 외 `NONE`
→ UI 라벨: 높음 / 보통 / 낮음 / 확인 안 됨

## 8. 참조 구현
```ts
// packages/core/scoring/connectionScore.ts
export function computeConnectionScore(
  s: RawScores, type: ConnectionKind, hopCount: number,
  flags: { hasEvidenceGap: boolean; ambiguousAlias: boolean; reviewed: boolean },
  cfg: ScoringConfig,
): number {
  const profile = cfg.profiles.NOMINAL.appliesTo.includes(type)
    ? cfg.profiles.NOMINAL : cfg.profiles.BUSINESS;

  // null 점수는 제외하고 가중치 재정규화
  const entries = Object.entries(profile.weights)
    .filter(([k]) => s[k as keyof RawScores] !== null) as [keyof RawScores, number][];
  const wSum = entries.reduce((a, [, w]) => a + w, 0);
  const base = entries.reduce((a, [k, w]) => a + w * (s[k] as number), 0) / wSum;

  const confFac = cfg.confidenceFactor.base + cfg.confidenceFactor.span * (s.confidence / 100);
  const hopFac  = Math.max(cfg.hopDecay.floor, 1 - cfg.hopDecay.perHop * (hopCount - 1));

  let out = Math.round(Math.min(100, Math.max(0, base * confFac * hopFac)));
  if (flags.hasEvidenceGap) out = Math.min(out, cfg.caps.noEvidenceEdge);
  if (flags.ambiguousAlias) out = Math.min(out, cfg.caps.ambiguousAlias);
  if (!flags.reviewed)      out = Math.min(out, cfg.caps.unreviewedHighScore);
  return out;
}
```

## 9. 계산 예시 (골든셋 #1 노루페인트)
```
BR=10  KM=95  SC=0  MR=81  ME=87  CF=90(=0.95×0.95)  hop=2  type=NAME_MATCH
profile = NOMINAL
base = .45×95 + .30×81 + .15×87 + .05×10 + .05×0 = 42.75+24.3+13.05+0.5+0 = 80.6
confFac = 0.6 + 0.4×0.90 = 0.96
hopFac  = 1 − 0.08×1 = 0.92
raw = 80.6 × 0.96 × 0.92 = 71.2  →  connection_score = 71
relevanceBand = NONE (BR=10)
```
카드 표기: **연결 강도 71 / 사업 연관성 확인 안 됨 / 밈력 87**. 세 숫자가 각자 제 역할을 한다.

## 10. 재계산
가중치를 바꾸면 `POST /internal/pipeline/rescore { date, version }`로 **연결을 새로 만들지 않고 점수만** 다시 계산한다(LLM 비용 0).
`scoring_version`이 다른 행이 섞이지 않도록 항상 함께 기록한다.
