import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-21T12:00:00+09:00');

  it('분 단위로 표시한다 (1시간 미만)', () => {
    expect(formatRelativeTime(new Date('2026-08-21T11:45:00+09:00'), now)).toBe('15분 전');
  });

  it('1분 미만은 방금 전으로 표시한다', () => {
    expect(formatRelativeTime(new Date('2026-08-21T11:59:40+09:00'), now)).toBe('방금 전');
  });

  it('시간 단위로 표시한다 (24시간 미만)', () => {
    expect(formatRelativeTime(new Date('2026-08-21T09:00:00+09:00'), now)).toBe('3시간 전');
  });

  it('하루 이상이면 날짜로 표시한다', () => {
    expect(formatRelativeTime(new Date('2026-08-19T09:00:00+09:00'), now)).toBe('2026-08-19');
  });

  it('미래 시각은 방금 전으로 취급한다', () => {
    expect(formatRelativeTime(new Date('2026-08-21T12:05:00+09:00'), now)).toBe('방금 전');
  });
});
