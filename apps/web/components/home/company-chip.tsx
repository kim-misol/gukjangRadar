import type { ConnectionDto } from '@gukjang/spec';
import Link from 'next/link';
import { companyChipTone } from '../../lib/format/tone';
import { cn } from '../../lib/utils';

const TONE_CLASS = {
  green: 'border-[oklch(0.5_0.12_150)] text-[oklch(0.4_0.12_150)]',
  blue: 'border-down text-down',
  gray: 'border-rule text-ink-soft',
} as const;

/**
 * docs/05-screen-specs.md S1 — 관련기업 칩. 색은 business_relevance 3단계(R4: 밈력과 분리).
 * `linkToStock`은 카드 전체가 이미 링크인 곳(홈 뉴스 카드)에서는 끄고, 그렇지 않은 곳
 * (연결 종목 리스트)에서만 켠다 — 앵커 중첩(invalid HTML)을 피하기 위함.
 */
export function CompanyChip({
  connection,
  linkToStock = false,
}: {
  connection: ConnectionDto;
  linkToStock?: boolean;
}) {
  const tone = companyChipTone({
    type: connection.type,
    businessRelevance: connection.scores.businessRelevance,
    memeScore: connection.scores.meme,
  });
  const className = cn(
    'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px]',
    TONE_CLASS[tone],
  );
  const content = (
    <>
      {connection.isMeme && <span aria-hidden>😂</span>}
      {connection.company.name}
    </>
  );

  if (linkToStock) {
    return (
      <Link href={`/stock/${connection.company.ticker}`} className={className}>
        {content}
      </Link>
    );
  }
  return <span className={className}>{content}</span>;
}
