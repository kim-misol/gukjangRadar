'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'submitted' | 'error';

/**
 * docs/05-screen-specs.md S5 — 사용자 제보 입력창. PRD D2: 1:1 응답 없음을 명시하고
 * 결과는 공개 피드에만 노출한다.
 */
export function DiscoveryRequestForm() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) return;

    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch('/api/v1/discovery/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed }),
      });
      if (res.status === 202) {
        setStatus('submitted');
        setKeyword('');
      } else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '제출에 실패했습니다.');
        setStatus('error');
      }
    } catch {
      setError('제출에 실패했습니다.');
      setStatus('error');
    }
  };

  return (
    <section className="border border-rule p-4">
      <h2 className="mb-1 font-serif text-base font-bold text-ink">키워드 제보</h2>
      <p className="mb-3 font-sans text-xs text-ink-soft">
        키워드를 던지면 공개 피드에서 함께 탐색합니다. 1:1로 답변드리지는 않습니다.
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          maxLength={40}
          placeholder="예: 2차전지 리사이클"
          className="flex-1 border border-rule bg-paper px-2 py-1.5 font-sans text-sm text-ink"
        />
        <button
          type="submit"
          disabled={status === 'submitting' || keyword.trim().length === 0}
          className="border border-rule-strong px-3 py-1.5 font-mono text-xs text-ink"
        >
          제보
        </button>
      </form>
      {status === 'submitted' && (
        <p className="mt-2 font-mono text-[11px] text-ink-soft">
          등록됐습니다. 공개 피드에서 탐색을 시작합니다.
        </p>
      )}
      {status === 'error' && <p className="mt-2 font-mono text-[11px] text-down">{error}</p>}
    </section>
  );
}
