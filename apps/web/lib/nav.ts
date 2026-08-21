/**
 * docs/03-ia.md §2 — 하단 탭 4개(모바일 우선). 알림은 W8(T3.3) 범위라 아직 라우트가 없다 —
 * `ready:false` 항목은 탭은 보이되 비활성 처리한다(dangling 링크 금지).
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  ready: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', label: '홈', href: '/', ready: true },
  { key: 'discovery', label: '발견', href: '/discovery', ready: true },
  { key: 'search', label: '검색', href: '/search', ready: true },
  { key: 'alerts', label: '알림', href: '/alerts', ready: false },
];
