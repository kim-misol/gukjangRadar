import { describe, expect, it } from 'vitest';
import { findLongVerbatimQuotes, hasLongVerbatimQuote } from './quote-guard';

describe('findLongVerbatimQuotes', () => {
  it('21자 이상 그대로 옮기면 위반으로 잡는다', () => {
    const source = '노루페인트가 3분기 영업이익이 전년 동기 대비 20% 늘었다고 공시했다';
    const summary = `요약: ${source.slice(0, 25)} 등 실적이 개선됐다.`;
    const violations = findLongVerbatimQuotes(summary, [source]);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('20자 이하만 겹치면 위반이 아니다', () => {
    const source = '노루페인트가 3분기 영업이익이 전년 동기 대비 20% 늘었다고 공시했다';
    const summary = `요약: ${source.slice(0, 20)} 등 실적이 개선됐다.`;
    expect(findLongVerbatimQuotes(summary, [source])).toEqual([]);
  });

  it('전혀 겹치지 않으면 위반 없음', () => {
    expect(
      findLongVerbatimQuotes('완전히 다른 문장입니다 정말로 그렇습니다', [
        '노루페인트가 3분기 영업이익이 전년 동기 대비 20% 늘었다고 공시했다',
      ]),
    ).toEqual([]);
  });

  it('여러 소스 텍스트 중 하나와만 겹쳐도 잡는다', () => {
    const source2 = '삼성전자가 반도체 부문에서 역대 최대 영업이익을 기록했다고 발표했다';
    const summary = `${source2.slice(0, 25)} 요약입니다.`;
    expect(findLongVerbatimQuotes(summary, ['무관한 텍스트', source2]).length).toBeGreaterThan(0);
  });

  it('maxQuoteLength를 조절할 수 있다', () => {
    const source = '가나다라마바사아자차카타파하';
    const summary = source.slice(0, 10);
    expect(findLongVerbatimQuotes(summary, [source], 20)).toEqual([]);
    expect(findLongVerbatimQuotes(summary, [source], 5).length).toBeGreaterThan(0);
  });
});

describe('hasLongVerbatimQuote', () => {
  it('위반이 있으면 true', () => {
    const source = '노루페인트가 3분기 영업이익이 전년 동기 대비 20% 늘었다고 공시했다';
    expect(hasLongVerbatimQuote(source.slice(0, 25), [source])).toBe(true);
  });

  it('위반이 없으면 false', () => {
    expect(hasLongVerbatimQuote('짧은 요약', ['전혀 다른 원문 텍스트입니다'])).toBe(false);
  });
});
