/**
 * T1.3.3 — KRX 장 상태 판별. docs/14-backlog.md S1.3.
 * 정규장 09:00~15:30 KST, 그 외 시간대는 장전/장후/휴장으로 나눈다.
 * 공휴일 판정은 호출자가 주는 `holidays`(YYYY-MM-DD 집합)에 전적으로 의존한다 — 이 모듈은
 * 스스로 달력을 알지 못한다(음력 공휴일은 계산이 아니라 실 데이터가 필요, kis/holidays.ts 참고).
 * 순수 함수, IO 없음 (R7).
 */
export type MarketStatus = 'PRE_MARKET' | 'OPEN' | 'AFTER_MARKET' | 'CLOSED';

function toKstParts(date: Date): {
  dateStr: string;
  weekday: number;
  minutesSinceMidnight: number;
} {
  const kst = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const dateStr = `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
  return {
    dateStr,
    weekday: kst.getDay(), // 0=일 6=토
    minutesSinceMidnight: kst.getHours() * 60 + kst.getMinutes(),
  };
}

export function getMarketStatus(now: Date, holidays: ReadonlySet<string>): MarketStatus {
  const { dateStr, weekday, minutesSinceMidnight: m } = toKstParts(now);

  if (weekday === 0 || weekday === 6 || holidays.has(dateStr)) return 'CLOSED';

  if (m >= 8 * 60 && m < 9 * 60) return 'PRE_MARKET';
  if (m >= 9 * 60 && m < 15 * 60 + 30) return 'OPEN';
  if (m >= 15 * 60 + 30 && m < 16 * 60) return 'AFTER_MARKET';
  return 'CLOSED';
}
