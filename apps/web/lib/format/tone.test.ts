import { describe, expect, it } from 'vitest';
import { companyChipTone, isMemeConnection } from './tone';

describe('isMemeConnection', () => {
  it('connection_type이 MEME이면 밈이다', () => {
    expect(isMemeConnection('MEME', 10)).toBe(true);
  });

  it('meme_score가 70 이상이면 타입과 무관하게 밈이다 (CLAUDE.md 용어 표)', () => {
    expect(isMemeConnection('DIRECT', 70)).toBe(true);
    expect(isMemeConnection('DIRECT', 69)).toBe(false);
  });
});

describe('companyChipTone', () => {
  it('밈 연결은 회색이다 (docs/05 S1)', () => {
    expect(companyChipTone({ type: 'MEME', businessRelevance: 90, memeScore: 90 })).toBe('gray');
  });

  it('business_relevance 60 이상이면 초록이다', () => {
    expect(companyChipTone({ type: 'DIRECT', businessRelevance: 60, memeScore: 0 })).toBe('green');
  });

  it('30~59는 파랑이다', () => {
    expect(companyChipTone({ type: 'DIRECT', businessRelevance: 30, memeScore: 0 })).toBe('blue');
    expect(companyChipTone({ type: 'DIRECT', businessRelevance: 59, memeScore: 0 })).toBe('blue');
  });

  it('30 미만은 회색이다', () => {
    expect(companyChipTone({ type: 'DIRECT', businessRelevance: 29, memeScore: 0 })).toBe('gray');
  });
});
