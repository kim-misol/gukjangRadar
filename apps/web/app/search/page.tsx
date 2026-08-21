import type { Metadata } from 'next';
import { SearchClient } from '../../components/search/search-client';

export const metadata: Metadata = { title: '검색 — 국장레이더' };

/** S6 검색 — docs/05-screen-specs.md. */
export default function SearchPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 border-b border-rule-strong pb-2 font-serif text-2xl font-bold text-ink">
        검색
      </h1>
      <SearchClient />
    </main>
  );
}
