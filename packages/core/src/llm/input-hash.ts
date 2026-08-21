/**
 * T2.2.1 — llm_run 캐시 키. docs/08 §7: "input_hash = sha256(headline + summary + prompt_version)".
 * sha256은 결정론적이고 부작용이 없는 계산이라 packages/core에 둔다 (R7 — 네트워크/DB I/O가
 * 아닌 순수 해시 연산). 문서는 단순 문자열 이어붙이기라고 쓰여 있지만, 서로 다른 입력 조합이
 * 같은 이어붙인 문자열을 만드는 걸 막기 위해(예: headline="ab"+summary="c" vs headline="a"+
 * summary="bc") 절대 텍스트에 나타나지 않는 NUL 문자를 구분자로 넣는다.
 */
import { createHash } from 'node:crypto';

const SEPARATOR = String.fromCharCode(0);

export function computeInputHash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join(SEPARATOR)).digest('hex');
}
