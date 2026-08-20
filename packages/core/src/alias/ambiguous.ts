/**
 * T1.1.4 — 모호 별칭 판별 (docs/12-edge-cases.md §A: "이름 매칭이 만드는 지옥").
 * 순수 함수만 둔다 (R7).
 *
 * A1: "일반명사/역사고유명사가 사명"인 케이스. 국어사전 전체를 붙이는 대신,
 * 테마/공급망 사전(T1.2.4/T1.2.5)과 같은 방식으로 **수기 사전**을 사전 시드로 둔다.
 * 새로 발견되는 모호 별칭은 이 배열에 계속 추가한다 (골든셋에도 케이스 추가할 것 — docs/13).
 */
export const AMBIGUOUS_ALIAS_DICTIONARY: ReadonlySet<string> = new Set([
  // docs/12-edge-cases.md §A1 예시 원문
  '한샘',
  '대한',
  '신라',
  '삼양',
  '대성',
  '태광',
  // 자주 쓰이는 일반 어휘와 겹치는 사명 (동일 취지로 보강)
  '노루', // 동물 '노루' — 노루페인트/노루홀딩스
  '한국',
  '동양',
  '우리',
  '하나',
  '제일',
]);

/**
 * 별칭이 국어사전상 일반명사·고빈도 어휘와 겹쳐 오탐 위험이 큰지 판별한다.
 * true면 `company_alias.is_ambiguous = true`로 저장 — R3/A1: KM −25, score cap 80,
 * 개체 subtype이 회사 도메인과 무관하면 REJECT 유도(연결 생성 단계, W5 T2.3.1에서 소비).
 */
export function isAmbiguousAlias(aliasNorm: string): boolean {
  if (AMBIGUOUS_ALIAS_DICTIONARY.has(aliasNorm)) return true;
  // A4: 1글자 별칭은 그 자체로 극단적으로 모호하다 (수십 종목 폭발 위험).
  if (Array.from(aliasNorm).length <= 1) return true;
  return false;
}
