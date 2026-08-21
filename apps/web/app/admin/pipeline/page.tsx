import type { Metadata } from 'next';
import { PipelineHealthPanel } from '../../../components/admin/pipeline-health-panel';

export const metadata: Metadata = { title: '파이프라인 상태 — 국장레이더 관리자' };

/** T4.3(D4) 파이프라인 대시보드 — docs/19-remaining-work.md §3. 내부 전용 화면(공개 IA 밖). */
export default function AdminPipelinePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 border-b border-rule-strong pb-2 font-serif text-2xl font-bold text-ink">
        파이프라인 상태
      </h1>
      <PipelineHealthPanel />
    </main>
  );
}
