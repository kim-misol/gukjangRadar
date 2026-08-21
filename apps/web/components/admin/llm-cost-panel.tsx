'use client';

import { useEffect, useState } from 'react';
import type { LlmCostSummary } from '../../lib/api/llm-costs';

const TOKEN_KEY = 'gr_admin_token';

/** T5(D5) LLM 비용 모니터 — docs/19-remaining-work.md §2. */
export function LlmCostPanel() {
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [summary, setSummary] = useState<LlmCostSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await fetch('/api/v1/admin/llm-costs', { headers: { 'x-admin-token': token } });
      if (res.status === 401) {
        setError('토큰이 올바르지 않습니다.');
        sessionStorage.removeItem(TOKEN_KEY);
        setToken('');
        return;
      }
      setSummary(await res.json());
    })();
  }, [token]);

  const submitToken = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem(TOKEN_KEY, tokenInput);
    setToken(tokenInput);
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

  if (error) return <p className="font-mono text-xs text-down">{error}</p>;
  if (!summary) return <p className="font-mono text-xs text-ink-soft">불러오는 중…</p>;

  const pctOfCap =
    summary.dailyCapUsd > 0 ? (summary.today.totalCostUsd / summary.dailyCapUsd) * 100 : 0;

  return (
    <div className="space-y-6">
      <section className="border border-rule p-4">
        <h2 className="mb-1 font-serif text-base font-bold text-ink">오늘 누적 비용</h2>
        <p className="font-mono text-2xl text-ink">
          ${summary.today.totalCostUsd.toFixed(4)}{' '}
          <span className="text-sm text-ink-soft">
            / ${summary.dailyCapUsd.toFixed(2)} 상한 ({pctOfCap.toFixed(1)}%)
          </span>
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">단계별 (오늘)</h2>
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-rule text-ink-soft">
              <th className="py-1">stage</th>
              <th className="py-1">호출 수</th>
              <th className="py-1">비용(USD)</th>
            </tr>
          </thead>
          <tbody>
            {summary.today.byStage.map((row) => (
              <tr key={row.key} className="border-b border-rule">
                <td className="py-1 text-ink">{row.key}</td>
                <td className="py-1 text-ink">{row.runCount}</td>
                <td className="py-1 text-ink">${row.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">모델별 (오늘)</h2>
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-rule text-ink-soft">
              <th className="py-1">model</th>
              <th className="py-1">호출 수</th>
              <th className="py-1">비용(USD)</th>
            </tr>
          </thead>
          <tbody>
            {summary.today.byModel.map((row) => (
              <tr key={row.key} className="border-b border-rule">
                <td className="py-1 text-ink">{row.key}</td>
                <td className="py-1 text-ink">{row.runCount}</td>
                <td className="py-1 text-ink">${row.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">상태별 (오늘)</h2>
        <p className="font-mono text-xs text-ink">
          {summary.today.byStatus.map((s) => `${s.status}:${s.runCount}`).join(' · ') || '없음'}
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">최근 7일 추이</h2>
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-rule text-ink-soft">
              <th className="py-1">날짜</th>
              <th className="py-1">비용(USD)</th>
            </tr>
          </thead>
          <tbody>
            {summary.last7Days.map((row) => (
              <tr key={row.date} className="border-b border-rule">
                <td className="py-1 text-ink">{row.date}</td>
                <td className="py-1 text-ink">${row.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
