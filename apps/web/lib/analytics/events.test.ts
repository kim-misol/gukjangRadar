import { describe, expect, it } from 'vitest';
import { buildAnalyticsEvent } from './events';

describe('buildAnalyticsEvent', () => {
  it('이벤트 이름·페이로드·타임스탬프(ISO)를 조립한다', () => {
    const event = buildAnalyticsEvent(
      'share',
      { connectionId: 1, channel: 'clipboard' },
      new Date('2026-08-21T00:00:00Z'),
    );
    expect(event).toEqual({
      name: 'share',
      payload: { connectionId: 1, channel: 'clipboard' },
      ts: '2026-08-21T00:00:00.000Z',
    });
  });

  it('now를 생략하면 현재 시각을 쓴다', () => {
    const before = Date.now();
    const event = buildAnalyticsEvent('graph_open', { clusterId: 1 });
    const after = Date.now();
    const ts = new Date(event.ts).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
