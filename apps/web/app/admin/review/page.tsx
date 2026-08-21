import type { Metadata } from 'next';
import { ReviewQueueClient } from '../../../components/admin/review-queue-client';

export const metadata: Metadata = { title: '검수 큐 — 국장레이더 관리자' };

/**
 * T4.2 관리자 검수 큐 — docs/13-validation.md §4. docs/03-ia.md 공개 라우트 표에는 없는
 * 내부 전용 화면(URL을 직접 아는 운영자만 접근, 마스트헤드/하단 네비게이션 밖).
 */
export default function AdminReviewPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 border-b border-rule-strong pb-2 font-serif text-2xl font-bold text-ink">
        검수 큐
      </h1>
      <ReviewQueueClient />
    </main>
  );
}
