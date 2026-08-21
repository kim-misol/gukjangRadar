'use client';

import { useState } from 'react';

/** C12 저장/북마크(V1.1) — docs/19-remaining-work.md §3. 로그인 안 했으면 누르면 안내만 하고 끝. */
export function BookmarkButton({
  connectionId,
  initialBookmarked,
  loggedIn,
}: {
  connectionId: number;
  initialBookmarked: boolean;
  loggedIn: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    if (!loggedIn) {
      setNeedsLogin(true);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/v1/connections/${connectionId}/bookmark`, {
      method: bookmarked ? 'DELETE' : 'POST',
    });
    if (res.ok) setBookmarked(!bookmarked);
    setLoading(false);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-label={bookmarked ? '저장 해제' : '저장'}
        aria-pressed={bookmarked}
        className="font-mono text-sm text-ink-soft"
      >
        {bookmarked ? '★' : '☆'}
      </button>
      {needsLogin && (
        <a
          href="/alerts"
          className="font-mono text-[10px] text-ink-soft underline underline-offset-2"
        >
          로그인 필요
        </a>
      )}
    </span>
  );
}
