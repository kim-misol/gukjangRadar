import type { Metadata } from 'next';

export const metadata: Metadata = { title: '고지 — 국장레이더' };

export default function DisclaimerPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 font-sans text-sm leading-relaxed text-ink">
      <h1 className="mb-6 font-serif text-2xl font-bold">고지</h1>
      <p className="mb-4">
        국장레이더는 뉴스와 종목의 연결을 보여주는 정보 서비스이며 투자 추천·자문이 아닙니다. 투자
        판단과 그 결과는 이용자 본인에게 귀속됩니다.
      </p>
      <p className="mb-4">
        화면에 표시되는 &ldquo;연결 강도&rdquo;는 뉴스와 종목 사이의 연결이 얼마나 뚜렷한지를
        나타내는 지표이며, 미래 수익률이나 주가 방향을 예측하지 않습니다.
      </p>
      <p className="mb-4">
        시세는 지연될 수 있으며, 화면에 항상 기준 시각을 함께 표기합니다. 뉴스 원문은
        저장·재배포하지 않고 제목과 AI 요약, 원문 링크만 제공합니다.
      </p>
    </main>
  );
}
