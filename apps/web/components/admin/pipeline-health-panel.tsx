'use client';

import { useEffect, useState } from 'react';
import type { PipelineHealthSummary } from '../../lib/api/pipeline-health';

const TOKEN_KEY = 'gr_admin_token';

/** T4.3(D4) 파이프라인 대시보드 — docs/19-remaining-work.md §3. */
export function PipelineHealthPanel() {
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [summary, setSummary] = useState<PipelineHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await fetch('/api/v1/admin/pipeline-health', {
        headers: { 'x-admin-token': token },
      });
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

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">큐 적체 (docs/11 §1 5개 큐)</h2>
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-rule text-ink-soft">
              <th className="py-1">queue</th>
              <th className="py-1">waiting</th>
              <th className="py-1">active</th>
              <th className="py-1">completed</th>
              <th className="py-1">failed</th>
              <th className="py-1">delayed</th>
            </tr>
          </thead>
          <tbody>
            {summary.queues.map((q) => (
              <tr key={q.name} className="border-b border-rule">
                <td className="py-1 text-ink">{q.name}</td>
                <td className="py-1 text-ink">{q.waiting}</td>
                <td className="py-1 text-ink">{q.active}</td>
                <td className="py-1 text-ink">{q.completed}</td>
                <td className={q.failed > 0 ? 'py-1 text-down' : 'py-1 text-ink'}>{q.failed}</td>
                <td className="py-1 text-ink">{q.delayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">가드레일 위반 (오늘, docs/13 §2)</h2>
        <p className="font-mono text-xs text-ink">
          {summary.guardrailViolationsToday.length === 0
            ? '없음'
            : summary.guardrailViolationsToday.map((v) => `${v.ruleId}:${v.count}`).join(' · ')}
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">최근 실패한 잡 (최대 10건)</h2>
        {summary.recentFailedJobs.length === 0 ? (
          <p className="font-mono text-xs text-ink-soft">없음</p>
        ) : (
          <ul className="space-y-2">
            {summary.recentFailedJobs.map((job) => (
              <li key={`${job.queue}-${job.jobId}`} className="border border-rule p-2">
                <p className="font-mono text-[11px] text-ink-soft">
                  {job.queue} · #{job.jobId}
                  {job.timestamp ? ` · ${new Date(job.timestamp).toLocaleString('ko-KR')}` : ''}
                </p>
                <p className="font-mono text-xs text-down">{job.failedReason ?? '(사유 없음)'}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
