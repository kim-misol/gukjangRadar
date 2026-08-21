'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** docs/05-screen-specs.md S2 엣지케이스 — "analysis_status = PENDING → ...5초 폴링". */
export function AnalysisPendingPoller({ clusterId }: { clusterId: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/v1/news/${clusterId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { analysisStatus: string };
      if (data.analysisStatus !== 'PENDING' && data.analysisStatus !== 'RUNNING') {
        router.refresh();
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [clusterId, router]);

  return null;
}
