/**
 * T2.3.6 — G7/G8이 참조하는 "위험 문맥" 결정론적 판정 (docs/13 §2, docs/12-edge-cases.md F4/F5).
 * LLM 판단이 아니라 표제/요약 문자열의 키워드 매칭이다 — 과탐(over-block)이 누락보다 안전하므로
 * 보수적으로 넓게 잡는다. 순수 함수, IO 없음 (R7).
 */

// docs/12-edge-cases.md F5: 재난·사망·인명피해 뉴스 — 밈 랭킹에서 하드 제외.
const DANGEROUS_EVENT_KEYWORDS = [
  '사망',
  '사상자',
  '참사',
  '침몰',
  '붕괴',
  '화재',
  '폭발',
  '추돌',
  '충돌',
  '실종',
  '순직',
  '중태',
] as const;

// docs/12-edge-cases.md F4: 인물의 부정적 사건(수사·기소·구속 등) — MEME 생성 하드 차단.
const NEGATIVE_PERSON_EVENT_KEYWORDS = [
  '구속',
  '기소',
  '체포',
  '수사',
  '횡령',
  '배임',
  '사기',
  '구속영장',
  '압수수색',
  '입건',
] as const;

function containsAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

export function isDangerousEventHeadline(headline: string): boolean {
  return containsAny(headline, DANGEROUS_EVENT_KEYWORDS);
}

export function isNegativePersonEventHeadline(headline: string): boolean {
  return containsAny(headline, NEGATIVE_PERSON_EVENT_KEYWORDS);
}
