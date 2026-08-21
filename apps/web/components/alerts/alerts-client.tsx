'use client';

import { useEffect, useState } from 'react';
import type { AlertKeywordDto } from '@gukjang/spec';
import { subscribeToPush, type PushSubscribeResult } from '../../lib/push/subscribe-client';
import { trackEvent } from '../../lib/analytics/track';

/** iOS Safari에서 웹푸시는 홈화면에 추가(standalone 모드)한 뒤에만 동작한다(docs/05 S7). */
function isIosBrowserNotInstalled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const nav = navigator as Navigator & { standalone?: boolean };
  return isIos && nav.standalone !== true;
}

const FREE_PLAN_KEYWORD_LIMIT = 5;

const PUSH_STATUS_LABEL: Record<PushSubscribeResult, string> = {
  SUBSCRIBED: '웹푸시가 켜졌습니다.',
  PERMISSION_DENIED: '브라우저 알림 권한이 거부됐습니다.',
  UNSUPPORTED:
    '이 브라우저는 웹푸시를 지원하지 않습니다. iOS는 홈화면에 추가한 뒤 다시 시도하세요.',
  ERROR: '구독에 실패했습니다. 잠시 후 다시 시도해 주세요.',
};

interface AlertsClientProps {
  initialAlerts: AlertKeywordDto[];
  vapidPublicKey: string | null;
}

/** S7 알림 — docs/05-screen-specs.md. 키워드 CRUD + 웹푸시 구독. */
export function AlertsClient({ initialAlerts, vapidPublicKey }: AlertsClientProps) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [keyword, setKeyword] = useState('');
  const [minScore, setMinScore] = useState(60);
  const [includeMeme, setIncludeMeme] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushSubscribeResult | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setShowIosHint(isIosBrowserNotInstalled());
  }, []);

  const atLimit = alerts.length >= FREE_PLAN_KEYWORD_LIMIT;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed || atLimit) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed, minScore, includeMeme }),
      });
      if (res.status === 201) {
        const created = (await res.json()) as AlertKeywordDto;
        setAlerts((prev) => [...prev, created]);
        setKeyword('');
        trackEvent('alert_register', { minScore, includeMeme });
      } else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '등록에 실패했습니다.');
      }
    } catch {
      setError('등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/v1/alerts/${id}`, { method: 'DELETE' }).catch(() => undefined);
  };

  const enablePush = async () => {
    if (!vapidPublicKey) return;
    setPushLoading(true);
    setPushStatus(await subscribeToPush(vapidPublicKey));
    setPushLoading(false);
  };

  const logout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  const withdraw = async () => {
    if (!window.confirm('탈퇴하면 등록된 키워드와 웹푸시 구독이 모두 삭제됩니다. 계속할까요?')) {
      return;
    }
    await fetch('/api/v1/auth/me', { method: 'DELETE' });
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-3 font-mono text-[11px] text-ink-soft">
        <a href="/bookmarks" className="underline underline-offset-2">
          북마크
        </a>
        <button type="button" onClick={logout} className="underline underline-offset-2">
          로그아웃
        </button>
        <button type="button" onClick={withdraw} className="underline underline-offset-2">
          탈퇴
        </button>
      </div>

      <section className="border border-rule p-4">
        <h2 className="mb-1 font-serif text-base font-bold text-ink">웹푸시</h2>
        <p className="mb-3 font-sans text-xs text-ink-soft">
          매칭 뉴스가 발생하면 브라우저 알림으로 도착합니다. iOS는 홈화면에 추가한 뒤에만
          가능합니다.
        </p>
        {showIosHint && (
          <ol className="mb-3 list-decimal space-y-0.5 border border-rule px-4 py-2 pl-8 font-mono text-[11px] text-ink-soft">
            <li>Safari 하단 공유 버튼을 누르세요</li>
            <li>&lsquo;홈 화면에 추가&rsquo;를 선택하세요</li>
            <li>홈 화면 아이콘으로 다시 연 뒤 아래 버튼을 눌러주세요</li>
          </ol>
        )}
        <button
          type="button"
          onClick={enablePush}
          disabled={pushLoading || !vapidPublicKey}
          className="border border-rule-strong px-3 py-1.5 font-mono text-xs text-ink"
        >
          {pushLoading ? '요청 중…' : '웹푸시 켜기'}
        </button>
        {pushStatus && (
          <p className="mt-2 font-mono text-[11px] text-ink-soft">
            {PUSH_STATUS_LABEL[pushStatus]}
          </p>
        )}
      </section>

      <section className="border border-rule p-4">
        <h2 className="mb-1 font-serif text-base font-bold text-ink">키워드 등록</h2>
        <p className="mb-3 font-sans text-xs text-ink-soft">
          무료 플랜은 최대 {FREE_PLAN_KEYWORD_LIMIT}개까지 등록할 수 있습니다 ({alerts.length}/
          {FREE_PLAN_KEYWORD_LIMIT}).
        </p>
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            maxLength={30}
            placeholder="예: 노루페인트"
            disabled={atLimit}
            className="min-w-40 flex-1 border border-rule bg-paper px-2 py-1.5 font-sans text-sm text-ink disabled:opacity-50"
          />
          <label className="flex items-center gap-1 font-mono text-xs text-ink-soft">
            연결 강도 ≥
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="border border-rule bg-paper px-1 py-1"
            >
              {[40, 50, 60, 70, 80].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 font-mono text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={includeMeme}
              onChange={(e) => setIncludeMeme(e.target.checked)}
            />
            밈 연결 포함
          </label>
          <button
            type="submit"
            disabled={submitting || atLimit || keyword.trim().length === 0}
            className="border border-rule-strong px-3 py-1.5 font-mono text-xs text-ink"
          >
            등록
          </button>
        </form>
        {error && <p className="mt-2 font-mono text-[11px] text-down">{error}</p>}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">등록된 키워드</h2>
        {alerts.length === 0 ? (
          <p className="font-sans text-sm text-ink-soft">등록된 키워드가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-sans text-sm text-ink">{a.keyword}</span>
                  <span className="ml-2 font-mono text-[11px] text-ink-soft">
                    연결 강도 ≥ {a.minScore}
                    {a.includeMeme ? ' · 밈 포함' : ' · 밈 제외'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="font-mono text-xs text-ink-soft underline underline-offset-2"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
