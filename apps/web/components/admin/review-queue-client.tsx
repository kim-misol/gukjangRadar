'use client';

import { useEffect, useState } from 'react';
import type { ConnectionDto } from '@gukjang/spec';

const TOKEN_KEY = 'gr_admin_token';

async function fetchQueue(
  token: string,
  onlyFlagged: boolean,
): Promise<ConnectionDto[] | 'UNAUTHORIZED'> {
  const res = await fetch(`/api/v1/admin/review-queue?onlyFlagged=${onlyFlagged}`, {
    headers: { 'x-admin-token': token },
  });
  if (res.status === 401) return 'UNAUTHORIZED';
  const body = (await res.json()) as { items: ConnectionDto[] };
  return body.items;
}

/** T4.2 관리자 검수 큐 — docs/13-validation.md §4. 공개 IA에 없는 내부 전용 화면. */
export function ReviewQueueClient() {
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [items, setItems] = useState<ConnectionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  const load = async (t: string, flagged: boolean) => {
    setLoading(true);
    setError(null);
    const result = await fetchQueue(t, flagged);
    if (result === 'UNAUTHORIZED') {
      setError('토큰이 올바르지 않습니다.');
      sessionStorage.removeItem(TOKEN_KEY);
      setToken('');
    } else {
      setItems(result);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (token) void load(token, onlyFlagged);
  }, [token, onlyFlagged]);

  const submitToken = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem(TOKEN_KEY, tokenInput);
    setToken(tokenInput);
  };

  const [correcting, setCorrecting] = useState<number | null>(null);
  const [correctedExplanation, setCorrectedExplanation] = useState('');

  const act = async (
    connectionId: number,
    action: 'APPROVE' | 'REJECT' | 'CORRECT',
    patch?: { explanation?: string },
  ) => {
    const res = await fetch(`/api/v1/admin/connections/${connectionId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ action, patch }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((c) => c.id !== connectionId));
      setCorrecting(null);
    }
  };

  if (!token) {
    return (
      <form onSubmit={submitToken} className="flex gap-2">
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="ADMIN_API_TOKEN"
          className="flex-1 border border-rule bg-paper px-2 py-1.5 font-mono text-sm text-ink"
        />
        <button
          type="submit"
          className="border border-rule-strong px-3 py-1.5 font-mono text-xs text-ink"
        >
          입장
        </button>
      </form>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <label className="flex items-center gap-1 font-mono text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          PENDING만
        </label>
        <span className="font-mono text-xs text-ink-soft">{items.length}건</span>
      </div>

      {loading && <p className="font-mono text-xs text-ink-soft">불러오는 중…</p>}
      {error && <p className="font-mono text-xs text-down">{error}</p>}

      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id} className="border border-rule p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-sans text-sm font-bold text-ink">
                {c.company.name} <span className="font-mono text-xs text-ink-soft">{c.type}</span>
              </span>
              <span className="font-mono text-xs text-ink-soft">
                연결 {c.scores.connection} · 사업연관 {c.scores.businessRelevance} · 밈{' '}
                {c.scores.meme} · {c.status}
              </span>
            </div>
            <p className="mb-1 font-sans text-sm text-ink">{c.explanation}</p>
            {c.caution && <p className="mb-1 font-sans text-xs text-down">주의: {c.caution}</p>}
            <p className="mb-2 font-mono text-[11px] text-ink-soft">
              {c.path.map((p) => p.label).join(' → ')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => act(c.id, 'APPROVE')}
                className="border border-rule-strong px-2 py-1 font-mono text-xs text-ink"
              >
                승인
              </button>
              <button
                type="button"
                onClick={() => act(c.id, 'REJECT')}
                className="border border-rule-strong px-2 py-1 font-mono text-xs text-ink"
              >
                기각
              </button>
              <button
                type="button"
                onClick={() => {
                  setCorrecting(c.id);
                  setCorrectedExplanation(c.explanation);
                }}
                className="border border-rule-strong px-2 py-1 font-mono text-xs text-ink"
              >
                정정
              </button>
            </div>
            {correcting === c.id && (
              <div className="mt-2 flex gap-2">
                <input
                  value={correctedExplanation}
                  onChange={(e) => setCorrectedExplanation(e.target.value)}
                  className="flex-1 border border-rule bg-paper px-2 py-1 font-sans text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={() => act(c.id, 'CORRECT', { explanation: correctedExplanation })}
                  className="border border-rule-strong px-2 py-1 font-mono text-xs text-ink"
                >
                  저장
                </button>
              </div>
            )}
          </li>
        ))}
        {!loading && items.length === 0 && (
          <p className="font-sans text-sm text-ink-soft">검수 대기가 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
