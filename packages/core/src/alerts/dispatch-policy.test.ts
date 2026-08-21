import { describe, expect, it } from 'vitest';
import {
  decideAlertDispatch,
  isQuietHoursKst,
  matchesAlertKeyword,
  type AlertDispatchInput,
} from './dispatch-policy';

describe('matchesAlertKeyword', () => {
  it('클러스터 제목에 키워드가 포함되면 매칭이다', () => {
    expect(
      matchesAlertKeyword({
        keywordNorm: '태풍',
        clusterHeadlineNorm: '역대급태풍노루북상',
        entityNameNorms: [],
      }),
    ).toBe(true);
  });

  it('개체 이름에 키워드가 포함되면 매칭이다 (docs/11 §2 ⑭)', () => {
    expect(
      matchesAlertKeyword({
        keywordNorm: '노루',
        clusterHeadlineNorm: '역대급태풍북상',
        entityNameNorms: ['노루페인트', '기상청'],
      }),
    ).toBe(true);
  });

  it('제목·개체 어디에도 없으면 매칭이 아니다', () => {
    expect(
      matchesAlertKeyword({
        keywordNorm: '반도체',
        clusterHeadlineNorm: '역대급태풍북상',
        entityNameNorms: ['노루페인트'],
      }),
    ).toBe(false);
  });
});

describe('isQuietHoursKst', () => {
  it('KST 22:00~07:00은 무음이다', () => {
    // 2026-08-21T13:30:00Z = KST 22:30
    expect(isQuietHoursKst(new Date('2026-08-21T13:30:00Z'))).toBe(true);
    // 2026-08-21T21:59:00Z = KST 06:59 (다음날)
    expect(isQuietHoursKst(new Date('2026-08-21T21:59:00Z'))).toBe(true);
  });

  it('KST 07:00~22:00은 무음이 아니다', () => {
    // 2026-08-21T22:00:00Z = KST 07:00
    expect(isQuietHoursKst(new Date('2026-08-21T22:00:00Z'))).toBe(false);
    // 2026-08-21T04:00:00Z = KST 13:00
    expect(isQuietHoursKst(new Date('2026-08-21T04:00:00Z'))).toBe(false);
  });
});

describe('decideAlertDispatch', () => {
  const base: AlertDispatchInput = {
    minScore: 60,
    includeMeme: true,
    connectionType: 'DIRECT',
    connectionScore: 80,
    memeScore: 0,
    dailyDeliveryCount: 0,
    now: new Date('2026-08-21T04:00:00Z'), // KST 13:00, 평시
  };

  it('조건을 모두 만족하면 발송한다', () => {
    expect(decideAlertDispatch(base)).toEqual({ dispatch: true });
  });

  it('connection_score가 minScore 미만이면 보류한다', () => {
    expect(decideAlertDispatch({ ...base, connectionScore: 59, minScore: 60 })).toEqual({
      dispatch: false,
      reason: 'BELOW_MIN_SCORE',
    });
  });

  it('밈 연결인데 includeMeme=false면 제외한다 (CLAUDE.md §6 밈 정의)', () => {
    expect(decideAlertDispatch({ ...base, connectionType: 'MEME', includeMeme: false })).toEqual({
      dispatch: false,
      reason: 'MEME_EXCLUDED',
    });
  });

  it('meme_score만 70 이상이어도 밈으로 취급한다', () => {
    expect(
      decideAlertDispatch({
        ...base,
        connectionType: 'DIRECT',
        memeScore: 70,
        includeMeme: false,
      }),
    ).toEqual({ dispatch: false, reason: 'MEME_EXCLUDED' });
  });

  it('키워드당 일 3회 상한에 도달하면 보류한다 (docs/05 S7)', () => {
    expect(decideAlertDispatch({ ...base, dailyDeliveryCount: 3 })).toEqual({
      dispatch: false,
      reason: 'DAILY_CAP_REACHED',
    });
  });

  it('22:00~07:00(KST)이면 조건을 만족해도 보류한다 — 다음 배치에서 재시도 가능하도록 거부가 아닌 보류', () => {
    expect(decideAlertDispatch({ ...base, now: new Date('2026-08-21T13:30:00Z') })).toEqual({
      dispatch: false,
      reason: 'QUIET_HOURS',
    });
  });
});
