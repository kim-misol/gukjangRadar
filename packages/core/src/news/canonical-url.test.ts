import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from './canonical-url';

describe('canonicalizeUrl', () => {
  it('트래킹 파라미터를 제거한다', () => {
    expect(canonicalizeUrl('https://example.com/a?utm_source=fb&id=1')).toBe(
      'https://example.com/a?id=1',
    );
  });

  it('여러 트래킹 파라미터를 모두 제거한다', () => {
    expect(canonicalizeUrl('https://example.com/a?id=1&utm_source=fb&fbclid=xyz&gclid=abc')).toBe(
      'https://example.com/a?id=1',
    );
  });

  it('쿼리 순서가 달라도 같은 정규화 결과를 만든다', () => {
    const a = canonicalizeUrl('https://example.com/a?b=2&a=1');
    const b = canonicalizeUrl('https://example.com/a?a=1&b=2');
    expect(a).toBe(b);
  });

  it('트래킹 파라미터만 다른 두 URL은 같은 결과로 모인다', () => {
    const a = canonicalizeUrl('https://example.com/a?id=1&utm_source=naver');
    const b = canonicalizeUrl('https://example.com/a?id=1&utm_source=google');
    expect(a).toBe(b);
  });

  it('호스트명을 소문자로 통일한다', () => {
    expect(canonicalizeUrl('https://Example.COM/a')).toBe('https://example.com/a');
  });

  it('끝의 슬래시를 제거한다 (루트 제외)', () => {
    expect(canonicalizeUrl('https://example.com/a/')).toBe('https://example.com/a');
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('fragment(#)를 제거한다', () => {
    expect(canonicalizeUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  it('파싱할 수 없는 입력은 트림만 해서 그대로 돌려준다', () => {
    expect(canonicalizeUrl('  not a url  ')).toBe('not a url');
  });

  it('쿼리가 없는 URL은 그대로 둔다', () => {
    expect(canonicalizeUrl('https://example.com/a')).toBe('https://example.com/a');
  });
});
