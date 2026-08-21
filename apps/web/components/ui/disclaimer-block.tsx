import Link from 'next/link';

/**
 * R5 필수 고지 문구 — docs/01-prd.md §7 D3(법적 경계 원본) 그대로.
 * docs/17-screen-design-guide.md에 살짝 다른 표현이 있으나(디자인 캔버스 세션의 임시 카피),
 * 법적 문구는 D3가 단일 진실 원천이라 이쪽을 쓴다 — docs/15-build-order.md W6 기록 참고.
 * packages/core/src/copy-guard/forbidden-words.ts SAFE_PHRASES와 연동(부분 문자열 매칭).
 */
export function DisclaimerBlock() {
  return (
    <p className="border-t border-rule px-4 py-4 text-center font-sans text-[11px] leading-relaxed text-ink-soft">
      국장레이더는 뉴스와 종목의 연결을 보여주는 정보 서비스이며 투자 추천·자문이 아닙니다. 투자
      판단과 그 결과는 이용자 본인에게 귀속됩니다.{' '}
      <Link href="/legal/disclaimer" className="underline underline-offset-2">
        자세히
      </Link>
    </p>
  );
}
