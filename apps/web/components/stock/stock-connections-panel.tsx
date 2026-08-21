'use client';

import type { ConnectionDto } from '@gukjang/spec';
import Link from 'next/link';
import { useState } from 'react';
import { buildPathPreview } from '../../lib/format/path-preview';
import { cn } from '../../lib/utils';
import { ConnectionTypeBadge } from '../ui/connection-type-badge';
import { RelevanceBandBadge } from '../ui/relevance-band-badge';
import { PathSteps } from './path-steps';

const RELEVANCE_NOTE: Record<ConnectionDto['relevanceBand'], string> = {
  HIGH: '사업보고서·공시 등 근거가 뚜렷합니다.',
  MEDIUM: '연관성은 있으나 근거가 제한적입니다.',
  LOW: '이름·표기가 비슷해 화제가 됐을 가능성이 큽니다.',
  NONE: '사업 연관성을 뒷받침할 근거를 찾지 못했습니다.',
};

/** docs/05-screen-specs.md S4 §2~4 — 오늘의 연결 카드 목록 + 선택한 연결의 경로/연관성. */
export function StockConnectionsPanel({ connections }: { connections: ConnectionDto[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(connections[0]?.id ?? null);

  if (connections.length === 0) {
    return (
      <p className="font-sans text-sm text-ink-soft">
        최근 이 종목과 설명 가능한 연결을 찾지 못했습니다.
      </p>
    );
  }

  const selected = connections.find((c) => c.id === selectedId) ?? connections[0]!;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ul className="space-y-2">
        {connections.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={cn(
                'w-full border px-3 py-2 text-left',
                c.id === selected.id ? 'border-rule-strong bg-rule/10' : 'border-rule',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <ConnectionTypeBadge type={c.type} />
                <span className="font-mono text-xs text-ink">연결 {c.scores.connection}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-ink-soft">{buildPathPreview(c.path)}</p>
              <Link
                href={`/news/${c.clusterId}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-block font-sans text-xs underline underline-offset-2"
              >
                뉴스 보기 →
              </Link>
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-4">
        <section>
          <h3 className="mb-2 font-mono text-xs text-ink-soft">왜 발견됐나요?</h3>
          <PathSteps path={selected.path} />
        </section>
        <section>
          <h3 className="mb-1 font-mono text-xs text-ink-soft">실제 사업 연관성</h3>
          <p className="flex items-center gap-2 font-sans text-sm text-ink">
            <RelevanceBandBadge band={selected.relevanceBand} />
          </p>
          <p className="mt-1 font-sans text-sm text-ink-soft">
            {selected.counterEvidence ?? RELEVANCE_NOTE[selected.relevanceBand]}
          </p>
          {selected.caution && (
            <p className="mt-1 font-sans text-xs text-ink-soft">주의: {selected.caution}</p>
          )}
        </section>
      </div>
    </div>
  );
}
