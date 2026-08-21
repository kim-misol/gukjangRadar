'use client';

import type { FeedbackKind } from '@gukjang/spec';
import { useEffect, useState } from 'react';
import { getOrCreateAnonId } from '../../lib/anon-id';
import { trackEvent } from '../../lib/analytics/track';
import { cn } from '../../lib/utils';

type Status = 'idle' | 'submitting' | 'submitted' | 'error';

function storageKey(connectionId: number): string {
  return `gr_feedback_${connectionId}`;
}

/** docs/05-screen-specs.md S2 §7 — "👍 이해됐어요 / 🤔 억지스러워요", 익명 허용 1인 1회. */
export function FeedbackButtons({ connectionId }: { connectionId: number }) {
  const [status, setStatus] = useState<Status>('idle');
  const [chosen, setChosen] = useState<FeedbackKind | null>(null);

  useEffect(() => {
    const prior = localStorage.getItem(storageKey(connectionId));
    if (prior === 'UNDERSTOOD' || prior === 'FARFETCHED') {
      setChosen(prior);
      setStatus('submitted');
    }
  }, [connectionId]);

  const submit = async (kind: FeedbackKind) => {
    setStatus('submitting');
    const anonId = getOrCreateAnonId(localStorage);
    try {
      const res = await fetch(`/api/v1/connections/${connectionId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, anonId }),
      });
      if (res.status === 204 || res.status === 409) {
        localStorage.setItem(storageKey(connectionId), kind);
        setChosen(kind);
        setStatus('submitted');
        if (res.status === 204) trackEvent('feedback_submit', { connectionId, kind });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'submitted') {
    return (
      <span className="font-mono text-[11px] text-ink-soft">
        {chosen === 'UNDERSTOOD' ? '👍 참여 완료' : '🤔 참여 완료'}
      </span>
    );
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={status === 'submitting'}
        onClick={() => submit('UNDERSTOOD')}
        className={cn('font-mono text-[11px] text-ink-soft underline underline-offset-2')}
      >
        👍 이해됐어요
      </button>
      <button
        type="button"
        disabled={status === 'submitting'}
        onClick={() => submit('FARFETCHED')}
        className="font-mono text-[11px] text-ink-soft underline underline-offset-2"
      >
        🤔 억지스러워요
      </button>
      {status === 'error' && <span className="font-mono text-[11px] text-down">전송 실패</span>}
    </div>
  );
}
