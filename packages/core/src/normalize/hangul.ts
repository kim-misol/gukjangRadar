/**
 * T1.1.2 — 한글 자모 분해 (docs/09-prompt-company-matching.md §2 "자모 유사도" 참조).
 * 순수 함수만 둔다 (R7). 외부 IO 없음.
 *
 * 분해 규칙 (docs/09 §2의 두 예시로 검증됨):
 *   원 → ㅇ,ㅝ,ㄴ 인데 ㅝ(ㅜ+ㅓ)를 다시 쪼개 ㅇ,ㅜ,ㅓ,ㄴ (4유닛) — 복합모음 ㅘㅙㅝㅞ는 분해한다.
 *   희 → ㅎ,ㅢ (2유닛) — ㅢ(그리고 ㅚ,ㅟ)는 더 쪼개지 않고 그대로 둔다.
 * 겹받침(ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ)도 두 자모로 분해한다 — 편집거리 해상도를 높여
 * "표기는 다르지만 자음/모음을 많이 공유하는" 밈 연결 후보를 더 잘 잡기 위함이다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

const CHO = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

const JUNG = [
  'ㅏ',
  'ㅐ',
  'ㅑ',
  'ㅒ',
  'ㅓ',
  'ㅔ',
  'ㅕ',
  'ㅖ',
  'ㅗ',
  'ㅘ',
  'ㅙ',
  'ㅚ',
  'ㅛ',
  'ㅜ',
  'ㅝ',
  'ㅞ',
  'ㅟ',
  'ㅠ',
  'ㅡ',
  'ㅢ',
  'ㅣ',
] as const;

const JONG = [
  '',
  'ㄱ',
  'ㄲ',
  'ㄳ',
  'ㄴ',
  'ㄵ',
  'ㄶ',
  'ㄷ',
  'ㄹ',
  'ㄺ',
  'ㄻ',
  'ㄼ',
  'ㄽ',
  'ㄾ',
  'ㄿ',
  'ㅀ',
  'ㅁ',
  'ㅂ',
  'ㅄ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

/** 복합모음 중 실제로 두 단순모음으로 더 쪼개는 것만 매핑. 나머지는 그대로 1유닛. */
const JUNG_SPLIT: Record<string, readonly [string, string]> = {
  ㅘ: ['ㅗ', 'ㅏ'],
  ㅙ: ['ㅗ', 'ㅐ'],
  ㅝ: ['ㅜ', 'ㅓ'],
  ㅞ: ['ㅜ', 'ㅔ'],
};

/** 겹받침 → 두 홑자음으로 분해. */
const JONG_SPLIT: Record<string, readonly [string, string]> = {
  ㄳ: ['ㄱ', 'ㅅ'],
  ㄵ: ['ㄴ', 'ㅈ'],
  ㄶ: ['ㄴ', 'ㅎ'],
  ㄺ: ['ㄹ', 'ㄱ'],
  ㄻ: ['ㄹ', 'ㅁ'],
  ㄼ: ['ㄹ', 'ㅂ'],
  ㄽ: ['ㄹ', 'ㅅ'],
  ㄾ: ['ㄹ', 'ㅌ'],
  ㄿ: ['ㄹ', 'ㅍ'],
  ㅀ: ['ㄹ', 'ㅎ'],
  ㅄ: ['ㅂ', 'ㅅ'],
};

/** 완성형 한글 음절 하나를 자모 유닛 배열로 분해한다. 음절이 아니면 그대로 [char]. */
export function decomposeSyllable(char: string): string[] {
  const code = char.codePointAt(0) ?? -1;
  if (code < HANGUL_BASE || code > HANGUL_LAST) return [char];

  const offset = code - HANGUL_BASE;
  const choIdx = Math.floor(offset / (JUNG_COUNT * JONG_COUNT));
  const jungIdx = Math.floor((offset % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT);
  const jongIdx = offset % JONG_COUNT;

  // choIdx/jungIdx/jongIdx는 위에서 완성형 한글 범위를 확인했으므로 항상 유효한 인덱스다.
  const cho = CHO[choIdx] as string;
  const jung = JUNG[jungIdx] as string;
  const jong = JONG[jongIdx] as string;

  const units: string[] = [cho];
  units.push(...(JUNG_SPLIT[jung] ?? [jung]));
  if (jong !== '') units.push(...(JONG_SPLIT[jong] ?? [jong]));
  return units;
}

/** 문자열 전체를 자모 유닛 배열로 분해한다 (한글이 아닌 문자는 그대로 통과). */
export function toJamoUnits(text: string): string[] {
  return Array.from(text).flatMap(decomposeSyllable);
}

/** toJamoUnits를 이어붙인 문자열. 로깅·디버깅·간단 비교용. */
export function toJamo(text: string): string {
  return toJamoUnits(text).join('');
}

/**
 * 표기 정규화 — 공백/특수문자 제거, 법인 표기 제거, 소문자화.
 * spec/schema.sql의 `name_norm`/`alias_norm` 생성 규칙과 일치시킬 것.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\(주\)|㈜|\(유\)|주식회사/g, '')
    .replace(/\s+/g, '')
    .replace(/[.,'"“”‘’·\-_/]/g, '')
    .toLowerCase()
    .trim();
}
