import { describe, expect, it } from 'vitest';
import { parseRobotsTxt, isPathAllowed } from './robots';

describe('parseRobotsTxt', () => {
  it('* 블록의 Disallow를 읽는다', () => {
    const txt = `User-agent: *\nDisallow: /rss/\nDisallow: /admin`;
    expect(parseRobotsTxt(txt, 'gukjang-radar-collector')).toEqual({
      disallow: ['/rss/', '/admin'],
    });
  });

  it('정확히 일치하는 UA 블록을 우선한다', () => {
    const txt = [
      'User-agent: *',
      'Disallow: /everything',
      '',
      'User-agent: gukjang-radar-collector',
      'Disallow: /only-us',
    ].join('\n');
    expect(parseRobotsTxt(txt, 'gukjang-radar-collector')).toEqual({ disallow: ['/only-us'] });
  });

  it('일치하는 UA 블록이 없으면 * 블록으로 폴백한다', () => {
    const txt = `User-agent: *\nDisallow: /private`;
    expect(parseRobotsTxt(txt, 'some-other-bot')).toEqual({ disallow: ['/private'] });
  });

  it('Disallow 값이 비어 있으면(전체 허용) 무시한다', () => {
    const txt = `User-agent: *\nDisallow:`;
    expect(parseRobotsTxt(txt, 'gukjang-radar-collector')).toEqual({ disallow: [] });
  });

  it('주석과 빈 줄을 무시한다', () => {
    const txt = ['# comment', 'User-agent: *', '', 'Disallow: /x # inline comment'].join('\n');
    expect(parseRobotsTxt(txt, 'gukjang-radar-collector')).toEqual({ disallow: ['/x'] });
  });

  it('여러 User-agent가 같은 블록을 공유하면 둘 다에 적용된다', () => {
    const txt = ['User-agent: bot-a', 'User-agent: bot-b', 'Disallow: /shared'].join('\n');
    expect(parseRobotsTxt(txt, 'bot-b')).toEqual({ disallow: ['/shared'] });
  });

  it('빈 robots.txt는 아무것도 막지 않는다', () => {
    expect(parseRobotsTxt('', 'gukjang-radar-collector')).toEqual({ disallow: [] });
  });
});

describe('isPathAllowed', () => {
  it('disallow 접두사와 일치하면 false', () => {
    expect(isPathAllowed('/rss/economy.xml', { disallow: ['/rss/'] })).toBe(false);
  });

  it('일치하지 않으면 true', () => {
    expect(isPathAllowed('/feed/economy.xml', { disallow: ['/rss/'] })).toBe(true);
  });

  it('disallow가 비어 있으면 항상 true', () => {
    expect(isPathAllowed('/anything', { disallow: [] })).toBe(true);
  });
});
