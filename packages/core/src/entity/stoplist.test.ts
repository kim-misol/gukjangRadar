import { describe, expect, it } from 'vitest';
import { isStoplisted } from './stoplist';

describe('isStoplisted', () => {
  const stoplist = new Set(['정부', '대통령실', '국회', '코스피', '코스닥', '증권가']);

  it('목록에 있으면 true', () => {
    expect(isStoplisted('코스피', stoplist)).toBe(true);
  });

  it('목록에 없으면 false', () => {
    expect(isStoplisted('노루페인트', stoplist)).toBe(false);
  });

  it('빈 목록이면 항상 false', () => {
    expect(isStoplisted('정부', new Set())).toBe(false);
  });
});
