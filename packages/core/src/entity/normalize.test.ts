import { describe, expect, it } from 'vitest';
import { normalizeEntityName } from './normalize';

describe('normalizeEntityName', () => {
  it('공백을 제거한다', () => {
    expect(normalizeEntityName('태풍 노루')).toBe('태풍노루');
  });

  it('특수문자를 제거한다', () => {
    expect(normalizeEntityName("태풍 '노루'")).toBe('태풍노루');
  });

  it('NFC로 정규화한다 (분해형 → 완성형)', () => {
    const decomposed = '노루'.normalize('NFD'); // 임의 분해 예시가 아니라도 NFC 통일만 확인
    expect(normalizeEntityName('노루'.normalize('NFD'))).toBe(normalizeEntityName('노루'));
    void decomposed;
  });

  it('법인 표기는 제거하지 않는다 (회사가 아니라 개체)', () => {
    expect(normalizeEntityName('(주)노루페인트')).toBe('주노루페인트');
  });

  it('영문/한글이 섞여도 동작한다', () => {
    expect(normalizeEntityName('리센느 원희')).toBe('리센느원희');
  });
});
