'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '../../lib/nav';
import { cn } from '../../lib/utils';

/** docs/03-ia.md §2 하단 탭 4개 — 모바일 고정, 데스크톱은 마스트헤드 우측 인라인(MastheadNav)로 대체. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-rule bg-paper md:hidden"
      aria-label="주요 메뉴"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.ready && pathname === item.href;
        return (
          <NavLink
            key={item.key}
            item={item}
            active={active}
            className="flex-1 py-2.5 text-center"
          />
        );
      })}
    </nav>
  );
}

/** 데스크톱 마스트헤드용 인라인 네비게이션. */
export function MastheadNav() {
  const pathname = usePathname();
  return (
    <div className="hidden items-center gap-4 md:flex" aria-label="주요 메뉴">
      {NAV_ITEMS.filter((item) => item.key !== 'home').map((item) => (
        <NavLink
          key={item.key}
          item={item}
          active={item.ready && pathname === item.href}
          className=""
        />
      ))}
    </div>
  );
}

function NavLink({
  item,
  active,
  className,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  className: string;
}) {
  const textClass = active
    ? 'font-bold text-ink'
    : item.ready
      ? 'text-ink-soft'
      : 'text-ink-soft/40';
  if (!item.ready) {
    return (
      <span
        className={cn('font-sans text-xs', textClass, className)}
        aria-disabled="true"
        title="준비 중"
      >
        {item.label}
      </span>
    );
  }
  return (
    <Link href={item.href} className={cn('font-sans text-xs', textClass, className)}>
      {item.label}
    </Link>
  );
}
