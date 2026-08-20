/**
 * T0.3.1 — 금지어 가드레일 (R5, docs/01-prd.md §7 D4).
 * 순수 함수만 둔다 (R7). CI 린터(scripts/lint-forbidden-words.ts)와
 * 런타임 가드레일(LLM 출력·연결 explanation 검사, G-시리즈)이 모두 이 모듈을 재사용한다.
 *
 * 주의: 한국어는 공백으로 단어 경계가 나뉘지 않으므로 부분 문자열 매칭을 쓴다.
 * "사라"처럼 "사라지다"의 부분일 수 있는 항목은 오탐 가능성이 있다 —
 * 실제 매칭 문맥을 사람이 확인할 것 (스코프를 좁히는 것은 향후 개선 과제).
 */

export interface ForbiddenWordRule {
  /** 매칭할 표면형 (부분 문자열) */
  word: string;
  /** 왜 금지인지 (자본시장법 리스크 근거) */
  reason: string;
  /** 대체 권장어 */
  suggestion?: string;
}

/**
 * CLAUDE.md R5 / docs/01-prd.md §7 D4 원본.
 * 이 배열을 늘릴 때는 두 문서도 함께 갱신할 것.
 */
export const FORBIDDEN_WORDS: readonly ForbiddenWordRule[] = [
  { word: '추천', reason: '유사투자자문업 신고 대상 문구', suggestion: '발견' },
  { word: '유망주', reason: '투자 권유로 읽힘', suggestion: '관심 가능성' },
  { word: '수혜주', reason: '투자 권유로 읽힘', suggestion: '연결' },
  { word: '급등 예상', reason: '미래 수익률 예측 금지 (R6)', suggestion: '시장 반응' },
  { word: '목표가', reason: '투자자문업 영역', suggestion: undefined },
  { word: '매수', reason: '매매 행위 지시', suggestion: undefined },
  { word: '매도', reason: '매매 행위 지시', suggestion: undefined },
  { word: '담아라', reason: '매매 행위 지시(명령형)', suggestion: undefined },
  {
    word: '사라',
    reason: '매매 행위 지시(명령형) — "사라지다" 등과 오탐 가능, 문맥 확인 필요',
    suggestion: undefined,
  },
] as const;

/**
 * 금지어가 부정문·고지 문맥에서 등장하는 사전 승인 문구.
 * docs/01-prd.md §7 D3의 필수 고지 문구가 대표 사례 — "투자 추천·자문이 아닙니다"에는
 * "추천"이 포함되지만 이 문장 자체가 법적으로 요구되는 부인 고지이므로 예외로 둔다.
 * 이 배열에 새 문구를 추가할 때는 정말로 "금지어를 부정/설명하는 문맥"인지 사람이 확인할 것 —
 * 아무 문구나 넣으면 가드레일이 무력화된다.
 */
export const SAFE_PHRASES: readonly string[] = [
  '투자 추천·자문이 아닙니다',
  '투자 추천·자문이 아니다',
  '투자 추천이나 자문이 아닙니다',
];

export interface ForbiddenWordMatch {
  word: string;
  index: number;
  reason: string;
}

export interface ForbiddenWordCheckResult {
  matched: boolean;
  matches: ForbiddenWordMatch[];
}

/** SAFE_PHRASES 구간을 같은 길이의 공백으로 치환해 인덱스를 보존한 채 매칭에서 제외한다. */
function maskSafePhrases(text: string): string {
  let masked = text;
  for (const phrase of SAFE_PHRASES) {
    masked = masked.split(phrase).join(' '.repeat(phrase.length));
  }
  return masked;
}

/**
 * 텍스트에 금지어가 있는지 검사한다. 순수 함수 — IO 없음.
 * SAFE_PHRASES에 해당하는 구간은 검사 대상에서 제외된다.
 */
export function checkForbiddenWords(text: string): ForbiddenWordCheckResult {
  const scanned = maskSafePhrases(text);
  const matches: ForbiddenWordMatch[] = [];
  for (const rule of FORBIDDEN_WORDS) {
    let fromIndex = 0;
    let idx = scanned.indexOf(rule.word, fromIndex);
    while (idx !== -1) {
      matches.push({ word: rule.word, index: idx, reason: rule.reason });
      fromIndex = idx + rule.word.length;
      idx = scanned.indexOf(rule.word, fromIndex);
    }
  }
  return { matched: matches.length > 0, matches };
}
