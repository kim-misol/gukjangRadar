import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '이용약관 — 국장레이더' };

/**
 * T5.1 초안 — docs/01-prd.md §7(법적 경계)의 D1~D5 결정을 그대로 반영한다.
 * 변호사 검토 전 임시 문서(§7 원문: "이 문서는 법률 자문이 아니다")라 페이지 상단에
 * 그 사실을 명시한다. 실 서비스 오픈 전 반드시 자본시장법 전문 변호사 검토가 필요하다(T5.6).
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 font-sans text-sm leading-relaxed text-ink">
      <h1 className="mb-2 font-serif text-2xl font-bold">이용약관</h1>
      <p className="mb-6 border border-rule-strong bg-paper px-3 py-2 font-mono text-[11px] text-ink-soft">
        초안입니다. 정식 서비스 오픈 전 변호사 검토를 거쳐야 하며, 이 문서 자체는 법률 자문이
        아닙니다(docs/01-prd.md §7).
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">제1조 (목적)</h2>
      <p className="mb-4">
        이 약관은 국장레이더(이하 &ldquo;회사&rdquo;)가 제공하는 뉴스-종목 연결 탐색 서비스(이하
        &ldquo;서비스&rdquo;)의 이용조건 및 절차, 이용자와 회사의 권리·의무를 정합니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">제2조 (서비스의 성격)</h2>
      <p className="mb-4">
        서비스는 공개된 뉴스와 상장 종목 사이의 연결 관계를 뉴스·공시 등 결정론적 근거를 바탕으로
        보여주는 정보 제공 서비스입니다.{' '}
        <strong>
          국장레이더는 뉴스와 종목의 연결을 보여주는 정보 서비스이며 투자 추천·자문이 아닙니다.
        </strong>{' '}
        특정 종목에 대한 거래를 지시하지 않습니다. 서비스가 표시하는 &ldquo;연결 강도&rdquo;는
        뉴스와 종목 사이 연결의 뚜렷함을 나타내는 지표일 뿐 미래 수익률이나 주가 방향을 예측하지
        않습니다. 이용자의 투자 판단과 그 결과는 전적으로 이용자 본인에게 귀속됩니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">제3조 (계정 및 로그인)</h2>
      <p className="mb-4">
        서비스의 조회 기능은 로그인 없이 이용할 수 있습니다. 키워드 알림 등록·웹푸시 구독 등 일부
        기능은 카카오·구글 소셜 로그인이 필요하며, 이 경우 제공받는 정보는 개인정보처리방침을
        따릅니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">제4조 (요금)</h2>
      <p className="mb-4">
        현재 서비스는 전체 기능을 무료로 제공합니다. 유료 플랜을 도입하는 경우 사전에 별도 고지하며,
        유사투자자문업 신고 등 관련 법령 검토를 마친 뒤에만 도입합니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">제5조 (금지 행위)</h2>
      <p className="mb-4">
        이용자는 서비스를 이용해 시세조종, 부정거래, 허위사실 유포 등 관련 법령이 금지하는 행위를
        해서는 안 됩니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">제6조 (면책)</h2>
      <p className="mb-4">
        회사는 서비스가 제공하는 정보의 정확성·완전성을 보장하지 않으며, 이용자가 서비스를 참고해
        내린 투자 판단으로 발생한 손실에 대해 책임지지 않습니다. 시세 정보는 지연될 수 있습니다.
      </p>

      <h2 className="mb-2 mt-6 font-serif text-lg font-bold">제7조 (약관의 변경)</h2>
      <p className="mb-4">
        회사는 필요한 경우 이 약관을 변경할 수 있으며, 변경 시 서비스 내 공지합니다.
      </p>

      <p className="mt-8 flex gap-3 font-mono text-xs text-ink-soft">
        <Link href="/legal/disclaimer" className="underline underline-offset-2">
          고지
        </Link>
        <Link href="/legal/privacy" className="underline underline-offset-2">
          개인정보처리방침
        </Link>
      </p>
    </main>
  );
}
