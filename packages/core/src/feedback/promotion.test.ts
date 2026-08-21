import { describe, expect, it } from 'vitest';
import { decideFeedbackPromotion, type FeedbackPromotionConfig } from './promotion';

const cfg: FeedbackPromotionConfig = {
  farfetchedRatioAtLeast: 0.4,
  minSample: 20,
  wrongCountAtLeast: 3,
};

describe('decideFeedbackPromotion (docs/13-validation.md §4)', () => {
  it('WRONG 3건 이상이면 ACTIVE를 PENDING으로 강등한다 (즉시 노출 중단)', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 0, FARFETCHED: 0, WRONG: 3 },
      'ACTIVE',
      cfg,
    );
    expect(result).toBe('PENDING');
  });

  it('WRONG 3건 이상이면 DISPUTED도 PENDING으로 강등한다', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 0, FARFETCHED: 0, WRONG: 3 },
      'DISPUTED',
      cfg,
    );
    expect(result).toBe('PENDING');
  });

  it('이미 PENDING이면 다시 PENDING으로 갱신하지 않는다 (변화 없음)', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 0, FARFETCHED: 0, WRONG: 3 },
      'PENDING',
      cfg,
    );
    expect(result).toBeNull();
  });

  it('WRONG 2건은 상한 미달이라 변화 없음', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 0, FARFETCHED: 0, WRONG: 2 },
      'ACTIVE',
      cfg,
    );
    expect(result).toBeNull();
  });

  it('FARFETCHED 비율 40% 초과 && 표본 20 이상이면 ACTIVE를 DISPUTED로 승격한다', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 11, FARFETCHED: 9, WRONG: 0 },
      'ACTIVE',
      cfg,
    );
    expect(result).toBe('DISPUTED');
  });

  it('비율이 정확히 40%면 "초과"가 아니므로 승격하지 않는다 (경계값)', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 12, FARFETCHED: 8, WRONG: 0 },
      'ACTIVE',
      cfg,
    );
    expect(result).toBeNull();
  });

  it('비율은 40% 초과여도 표본이 20 미만이면 승격하지 않는다', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 5, FARFETCHED: 5, WRONG: 0 },
      'ACTIVE',
      cfg,
    );
    expect(result).toBeNull();
  });

  it('이미 DISPUTED면 다시 DISPUTED로 갱신하지 않는다', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 11, FARFETCHED: 9, WRONG: 0 },
      'DISPUTED',
      cfg,
    );
    expect(result).toBeNull();
  });

  it('REJECTED는 관리자의 최종 결정이므로 피드백이 덮어쓰지 않는다', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 0, FARFETCHED: 0, WRONG: 5 },
      'REJECTED',
      cfg,
    );
    expect(result).toBeNull();
  });

  it('CORRECTED도 관리자의 최종 결정이므로 피드백이 덮어쓰지 않는다', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 0, FARFETCHED: 20, WRONG: 0 },
      'CORRECTED',
      cfg,
    );
    expect(result).toBeNull();
  });

  it('WRONG과 FARFETCHED 조건이 동시에 성립하면 더 심각한 WRONG(PENDING)이 우선한다', () => {
    const result = decideFeedbackPromotion(
      { UNDERSTOOD: 8, FARFETCHED: 9, WRONG: 3 },
      'ACTIVE',
      cfg,
    );
    expect(result).toBe('PENDING');
  });
});
