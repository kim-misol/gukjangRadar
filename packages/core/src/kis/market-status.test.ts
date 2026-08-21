import { describe, expect, it } from 'vitest';
import { getMarketStatus } from './market-status';

const noHolidays = new Set<string>();

describe('getMarketStatus', () => {
  it('평일 09:00~15:30(KST)는 OPEN이다', () => {
    // 2026-08-21은 금요일
    expect(getMarketStatus(new Date('2026-08-21T01:00:00Z'), noHolidays)).toBe('OPEN'); // 10:00 KST
  });

  it('평일 08:00~09:00은 PRE_MARKET이다', () => {
    expect(getMarketStatus(new Date('2026-08-20T23:30:00Z'), noHolidays)).toBe('PRE_MARKET'); // 08:30 KST
  });

  it('평일 15:30~16:00은 AFTER_MARKET이다', () => {
    expect(getMarketStatus(new Date('2026-08-21T06:45:00Z'), noHolidays)).toBe('AFTER_MARKET'); // 15:45 KST
  });

  it('그 외 시간대는 CLOSED다', () => {
    expect(getMarketStatus(new Date('2026-08-21T12:00:00Z'), noHolidays)).toBe('CLOSED'); // 21:00 KST
  });

  it('주말은 시간과 무관하게 CLOSED다', () => {
    // 2026-08-22는 토요일
    expect(getMarketStatus(new Date('2026-08-22T02:00:00Z'), noHolidays)).toBe('CLOSED'); // 토 11:00 KST
  });

  it('휴장일 집합에 있으면 CLOSED다', () => {
    const holidays = new Set(['2026-08-21']);
    expect(getMarketStatus(new Date('2026-08-21T01:00:00Z'), holidays)).toBe('CLOSED');
  });
});
