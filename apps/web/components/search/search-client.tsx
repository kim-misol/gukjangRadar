'use client';

import type { SearchResultDto } from '../../lib/api/queries';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '../../lib/format/relative-time';

type Tab = 'all' | 'news' | 'company' | 'keyword';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'news', label: '뉴스' },
  { key: 'company', label: '기업' },
  { key: 'keyword', label: '키워드' },
];

const RECENT_KEY = 'gr_recent_searches';
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(q: string): void {
  const list = [q, ...loadRecent().filter((r) => r !== q)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

/** docs/05-screen-specs.md S6 — 단일 입력 + 3탭, 최근 검색어 로컬 저장, 0건 제안. */
export function SearchClient() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [result, setResult] = useState<SearchResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResult(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&kind=${tab}`);
      if (res.ok) {
        setResult(await res.json());
        saveRecent(q);
        setRecent(loadRecent());
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tab]);

  const hasNoResults =
    result &&
    result.news.length === 0 &&
    result.companies.length === 0 &&
    result.entities.length === 0;

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="뉴스 제목, 기업명, 키워드로 검색"
        autoFocus
        className="w-full border border-rule-strong bg-paper px-3 py-2 font-sans text-base text-ink"
      />

      <div className="mt-3 flex gap-4 border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`pb-2 font-mono text-xs ${
              tab === t.key ? 'border-b-2 border-ink-soft font-bold text-ink' : 'text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!query && recent.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 font-mono text-xs text-ink-soft">최근 검색어</p>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setQuery(r)}
                className="border border-rule px-2 py-0.5 font-sans text-xs text-ink-soft"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="mt-4 font-mono text-xs text-ink-soft">검색 중…</p>}

      {result && !loading && (
        <div className="mt-4 space-y-6">
          {hasNoResults && (
            <div>
              <p className="font-sans text-sm text-ink-soft">검색 결과가 없습니다.</p>
              {result.suggestions.length > 0 && (
                <p className="mt-1 font-sans text-sm text-ink">
                  혹시{' '}
                  {result.suggestions.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <button
                        type="button"
                        onClick={() => setQuery(s)}
                        className="underline underline-offset-2"
                      >
                        &lsquo;{s}&rsquo;
                      </button>
                    </span>
                  ))}
                  ?
                </p>
              )}
            </div>
          )}

          {result.companies.length > 0 && (
            <section>
              <h2 className="mb-2 font-mono text-xs text-ink-soft">기업</h2>
              <ul className="flex flex-wrap gap-2">
                {result.companies.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/stock/${c.ticker}`}
                      className="border border-rule px-2 py-1 font-sans text-sm text-ink underline underline-offset-2"
                    >
                      {c.name} <span className="font-mono text-xs text-ink-soft">{c.ticker}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.entities.length > 0 && (
            <section>
              <h2 className="mb-2 font-mono text-xs text-ink-soft">키워드</h2>
              <ul className="flex flex-wrap gap-2">
                {result.entities.map((e) => (
                  <li
                    key={e.id}
                    className="border border-rule px-2 py-1 font-sans text-sm text-ink-soft"
                  >
                    {e.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.news.length > 0 && (
            <section>
              <h2 className="mb-2 font-mono text-xs text-ink-soft">뉴스</h2>
              <ul className="divide-y divide-rule border-y border-rule">
                {result.news.map((n) => (
                  <li key={n.id} className="py-2">
                    <Link href={`/news/${n.id}`} className="font-serif text-base text-ink">
                      {n.headline}
                    </Link>
                    <p className="font-mono text-[11px] text-ink-soft">
                      {formatRelativeTime(new Date(n.firstSeenAt))}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
