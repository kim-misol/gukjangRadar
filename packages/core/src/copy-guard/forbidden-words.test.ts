import { describe, expect, it } from 'vitest';
import { checkForbiddenWords } from './forbidden-words';

describe('checkForbiddenWords', () => {
  it('정상 카피는 통과한다', () => {
    const result = checkForbiddenWords(
      '이 뉴스는 노루페인트와 이름이 일치해 발견되었습니다. 사업 연관성은 낮습니다.',
    );
    expect(result.matched).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('"추천" 포함 카피를 잡아낸다', () => {
    const result = checkForbiddenWords('이 종목을 추천합니다.');
    expect(result.matched).toBe(true);
    expect(result.matches.map((m) => m.word)).toContain('추천');
  });

  it('"매수"/"매도" 둘 다 잡아낸다', () => {
    const result = checkForbiddenWords('지금 매수하고 나중에 매도하세요.');
    const words = result.matches.map((m) => m.word);
    expect(words).toContain('매수');
    expect(words).toContain('매도');
  });

  it('같은 단어가 여러 번 나오면 모두 위치를 기록한다', () => {
    const result = checkForbiddenWords('추천 추천');
    expect(result.matches.filter((m) => m.word === '추천')).toHaveLength(2);
  });

  it('D3 필수 고지 문구("투자 추천·자문이 아닙니다")는 안전 문구로 통과한다', () => {
    const result = checkForbiddenWords(
      '국장레이더는 뉴스와 종목의 연결을 보여주는 정보 서비스이며 투자 추천·자문이 아닙니다.',
    );
    expect(result.matched).toBe(false);
  });

  it('안전 문구 밖에 진짜 금지어가 있으면 여전히 잡는다', () => {
    const result = checkForbiddenWords('투자 추천·자문이 아닙니다. 그래도 이 종목을 추천합니다.');
    expect(result.matched).toBe(true);
    expect(result.matches).toHaveLength(1);
  });
});
