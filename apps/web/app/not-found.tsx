import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center">
      <p className="font-mono text-sm text-ink-soft">404</p>
      <h1 className="mt-2 font-serif text-2xl font-bold text-ink">페이지를 찾을 수 없습니다</h1>
      <p className="mt-2 font-sans text-sm text-ink-soft">
        주소가 바뀌었거나 더 이상 존재하지 않는 페이지입니다.
      </p>
      <Link href="/" className="mt-6 inline-block font-mono text-sm underline underline-offset-2">
        ← 홈으로
      </Link>
    </main>
  );
}
