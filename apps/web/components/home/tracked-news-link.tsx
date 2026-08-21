'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { trackEvent } from '../../lib/analytics/track';

/**
 * T5.3 — `NewsClusterCard`(서버 컴포넌트, `CompanyChip`을 통해 `@gukjang/core`를 node:fs/
 * node:crypto까지 끌어온다)를 통째로 클라이언트 컴포넌트로 만들면 그 전체 의존성 그래프가
 * 브라우저 번들에 들어가 next build가 깨진다 — 클릭 추적 하나 때문에 카드를 통째로 클라
 * 이언트로 바꾸는 대신, Link+추적만 하는 얇은 클라이언트 래퍼를 분리했다(children은 서버
 * 컴포넌트로 그대로 남는다, RSC의 "client component가 server component children을 감싸는"
 * 패턴).
 */
export function TrackedNewsLink({
  clusterId,
  source,
  className,
  children,
}: {
  clusterId: number;
  source: 'home' | 'discovery' | 'search';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/news/${clusterId}`}
      onClick={() => trackEvent('card_view', { clusterId, source })}
      className={className}
    >
      {children}
    </Link>
  );
}
