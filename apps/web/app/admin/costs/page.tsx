import type { Metadata } from 'next';
import { LlmCostPanel } from '../../../components/admin/llm-cost-panel';

export const metadata: Metadata = { title: 'LLM 비용 — 국장레이더 관리자' };

/** T5(D5) LLM 비용 모니터 — docs/19-remaining-work.md §2. 내부 전용 화면(공개 IA 밖). */
export default function AdminCostsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 border-b border-rule-strong pb-2 font-serif text-2xl font-bold text-ink">
        LLM 비용
      </h1>
      <LlmCostPanel />
    </main>
  );
}
