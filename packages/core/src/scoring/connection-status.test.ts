import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { ReviewTriggersConfig } from './types';
import { decideConnectionStatus } from './connection-status';

const cfg = scoringConfig.reviewTriggers as ReviewTriggersConfig;

const BASE = {
  businessRelevance: 10,
  connectionScore: 50,
  memeScore: 20,
  hopCount: 1,
  isAmbiguousAlias: false,
  forcedPending: false,
};

describe('decideConnectionStatus', () => {
  it('아무 트리거도 없으면 ACTIVE', () => {
    expect(decideConnectionStatus(BASE, cfg)).toBe('ACTIVE');
  });

  it('businessRelevance≥80이면 PENDING', () => {
    expect(decideConnectionStatus({ ...BASE, businessRelevance: 80 }, cfg)).toBe('PENDING');
  });

  it('connectionScore≥90이면 PENDING', () => {
    expect(decideConnectionStatus({ ...BASE, connectionScore: 90 }, cfg)).toBe('PENDING');
  });

  it('hopCount≥4이면 PENDING', () => {
    expect(decideConnectionStatus({ ...BASE, hopCount: 4 }, cfg)).toBe('PENDING');
  });

  it('모호 별칭이면 PENDING', () => {
    expect(decideConnectionStatus({ ...BASE, isAmbiguousAlias: true }, cfg)).toBe('PENDING');
  });

  it('forcedPending(G3)이면 다른 조건과 무관하게 PENDING', () => {
    expect(decideConnectionStatus({ ...BASE, forcedPending: true }, cfg)).toBe('PENDING');
  });
});
