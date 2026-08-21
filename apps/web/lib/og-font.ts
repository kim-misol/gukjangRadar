/**
 * docs/07-api-spec.md §8 — OG 이미지에 필요한 한글 서체를 런타임에 가져온다.
 * `next/og`(satori)의 기본 서체는 한글 글리프가 없어 그대로 쓰면 네모(tofu)만 보인다.
 * 매 요청 전체 서체를 받으면 느리니, Google Fonts CSS의 `text=` 서브셋 파라미터로
 * 실제로 그릴 글자만 담긴 작은 파일을 받는다. 실패하면 null을 반환해 라틴/숫자만이라도
 * 정상 렌더되게 한다(하드 실패시키지 않음).
 */
export async function fetchKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=${encodeURIComponent(text)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/src: url\(([^)]+)\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1]!);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}
