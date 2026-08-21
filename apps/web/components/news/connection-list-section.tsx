'use client';

import { CONNECTION_KIND_META, type ConnectionDto } from '@gukjang/spec';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ConnectionTypeBadge } from '../ui/connection-type-badge';
import { RelevanceBandBadge } from '../ui/relevance-band-badge';
import { FeedbackButtons } from './feedback-buttons';
import { cn } from '../../lib/utils';

/**
 * docs/05-screen-specs.md S2 §5 — 연결 종목 리스트. 기본 정렬 connection_score desc,
 * 필터 토글(사업 연관만/밈 포함)은 이미 서버에서 다 받아온 목록을 클라이언트에서 거른다
 * (클러스터당 연결 수십 건 이하라 왕복 없이도 충분히 빠르다).
 */
export function ConnectionListSection({ connections }: { connections: ConnectionDto[] }) {
  const [businessOnly, setBusinessOnly] = useState(false);
  const [includeMeme, setIncludeMeme] = useState(true);

  const visible = useMemo(() => {
    let list = connections;
    if (businessOnly) list = list.filter((c) => CONNECTION_KIND_META[c.type].countsAsBusiness);
    if (!includeMeme) list = list.filter((c) => !c.isMeme);
    return [...list].sort((a, b) => b.scores.connection - a.scores.connection);
  }, [connections, businessOnly, includeMeme]);

  if (connections.length === 0) {
    return <p className="font-sans text-sm text-ink-soft">설명 가능한 연결을 찾지 못했습니다.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex gap-4 font-mono text-[11px] text-ink-soft">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={businessOnly}
            onChange={(e) => setBusinessOnly(e.target.checked)}
          />
          사업 연관만
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={includeMeme}
            onChange={(e) => setIncludeMeme(e.target.checked)}
          />
          밈 포함
        </label>
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {visible.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <Link
              href={`/stock/${c.company.ticker}`}
              className={cn(
                'font-sans text-sm text-ink underline underline-offset-2',
                c.status === 'CORRECTED' && 'line-through decoration-ink-soft',
              )}
            >
              {c.company.name}
            </Link>
            <span className="font-mono text-xs text-ink-soft">{c.company.ticker}</span>
            <ConnectionTypeBadge type={c.type} />
            {c.status === 'CORRECTED' && (
              <span
                className="rounded-sm bg-ink px-1 py-0.5 font-mono text-[10px] text-paper"
                title={c.caution ?? '점수/설명이 사후에 정정됐습니다.'}
              >
                정정됨
              </span>
            )}
            <span className="font-mono text-xs text-ink">연결 {c.scores.connection}</span>
            <span className="flex items-center gap-1 font-mono text-xs text-ink-soft">
              사업연관성 <RelevanceBandBadge band={c.relevanceBand} />
            </span>
            <span className="font-mono text-xs text-ink-soft">
              {c.market?.volumeRatio20 != null ? `거래량 ${c.market.volumeRatio20}배` : '거래량 —'}
            </span>
            {c.isMeme && <span aria-hidden>😂</span>}
            <FeedbackButtons connectionId={c.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
