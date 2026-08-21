'use client';

import { useState } from 'react';

/** docs/05-screen-specs.md S5 — "각 항목 공유 버튼 → OG 이미지 + 딥링크". */
export function ShareButton({
  shareImageUrl,
  deepLink,
}: {
  shareImageUrl: string;
  deepLink: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(new URL(deepLink, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 조용히 무시 — 공유 이미지 링크는 여전히 아래에서 열 수 있다.
    }
  };

  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] text-ink-soft">
      <a
        href={shareImageUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        공유 이미지
      </a>
      <button type="button" onClick={copyLink}>
        {copied ? '복사됨' : '링크 복사'}
      </button>
    </span>
  );
}
