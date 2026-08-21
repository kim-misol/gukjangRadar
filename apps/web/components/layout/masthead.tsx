import Link from 'next/link';
import { MastheadNav } from './bottom-nav';

const LAUNCH_DATE = new Date('2026-08-01T00:00:00+09:00');

function editionNumber(now: Date): number {
  const days = Math.floor((now.getTime() - LAUNCH_DATE.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, days + 1);
}

function formatDate(now: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(now);
}

/**
 * docs/17-screen-design-guide.md 레이아웃 규칙 1~2 — 모든 화면 공통(root layout).
 * "호수"는 신문 지면 컨셉을 위한 장식용 발행 회차이며 실데이터가 아니다.
 */
export function Masthead() {
  const now = new Date();
  return (
    <header className="border-b-[3px] border-double border-rule-strong">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-1.5 font-mono text-[11px] text-ink-soft">
        <span>제 {editionNumber(now)}호</span>
        <span>{formatDate(now)}</span>
      </div>
      <div className="mx-auto flex max-w-[1280px] items-center justify-between border-t border-rule px-4 py-3">
        <Link
          href="/"
          className="font-serif text-[28px] font-bold tracking-[0.35em] text-ink md:text-[46px]"
        >
          국장레이더
        </Link>
        <MastheadNav />
      </div>
    </header>
  );
}
