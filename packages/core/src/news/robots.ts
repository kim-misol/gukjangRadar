/**
 * T2.1.1 — robots.txt 최소 파서 (docs/16-news-sources.md §1: "robots.txt를 기동 시 1회
 * 확인하고 캐시. Disallow면 소스 자동 비활성화"). 순수 함수, 외부 IO 없음 (R7) —
 * 실제 fetch는 worker의 RssClient가 한다.
 *
 * `Allow` 우선순위·와일드카드(`*`, `$`) 같은 전체 스펙은 구현하지 않는다 — 우리가
 * 신경 쓰는 건 "이 피드 경로가 명시적으로 막혀 있는가" 하나뿐이라 Disallow 접두사
 * 매칭만으로 충분하다.
 */

export interface RobotsRules {
  disallow: string[];
}

interface Block {
  userAgents: string[];
  disallow: string[];
}

/** robots.txt 본문을 파싱해, 주어진 User-Agent에 적용되는 규칙을 골라낸다. */
export function parseRobotsTxt(text: string, userAgent: string): RobotsRules {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0);

  const blocks: Block[] = [];
  let current: Block | null = null;
  let collectingAgents = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (!key) continue;

    if (key === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { userAgents: [], disallow: [] };
        blocks.push(current);
        collectingAgents = true;
      }
      current.userAgents.push(value.toLowerCase());
    } else if (key === 'disallow' && current) {
      collectingAgents = false;
      if (value.length > 0) current.disallow.push(value);
    } else {
      collectingAgents = false;
    }
  }

  const target = userAgent.toLowerCase();
  const exact = blocks.filter((b) => b.userAgents.includes(target));
  const matched = exact.length > 0 ? exact : blocks.filter((b) => b.userAgents.includes('*'));

  return { disallow: matched.flatMap((b) => b.disallow) };
}

/** 주어진 경로가 disallow 규칙(접두사 매칭)에 걸리지 않으면 true. */
export function isPathAllowed(path: string, rules: RobotsRules): boolean {
  return !rules.disallow.some((prefix) => path.startsWith(prefix));
}
