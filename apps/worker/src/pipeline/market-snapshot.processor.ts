/**
 * T1.3.2(스냅샷 동기화)+docs/11-pipeline.md §⑪(시세 재점수화) 배치 — `market.snapshot` 큐.
 * `pipeline-scheduler.service.ts`가 5분마다(장중 시간대 창) 큐잉한다.
 * `syncMarketSnapshots`가 장중이 아니면 스스로 no-op하므로(`getMarketStatus` 게이트,
 * docs/11 §2 ⑪) 이 프로세서는 시간대를 다시 검사하지 않는다.
 * `KIS_APP_KEY/SECRET`이 없으면(이 샌드박스 등, connection-build.processor.ts의 DartClient와
 * 같은 조건부 배선 패턴) 스냅샷 동기화 자체는 건너뛰고 재점수화만 시도한다 — 과거에 쌓인
 * 스냅샷이 있다면 그걸로도 재점수화는 여전히 유효하다.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getDb } from '@gukjang/db';
import { loadEnv, type MarketReactionConfig, type ScoringConfig } from '@gukjang/core';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import { KisClient } from '../collectors/kis-client';
import { syncMarketSnapshots } from '../collectors/sync-market-snapshot';
import { rescoreConnectionsForMarketReaction } from '../connections/rescore-market';

export interface MarketSnapshotJobResult {
  sync: Awaited<ReturnType<typeof syncMarketSnapshots>> | null;
  rescore: Awaited<ReturnType<typeof rescoreConnectionsForMarketReaction>>;
}

@Processor('market.snapshot', { concurrency: 1 })
export class MarketSnapshotProcessor extends WorkerHost {
  private readonly db = getDb();
  private readonly env = loadEnv();
  private readonly kisClient =
    this.env.KIS_APP_KEY && this.env.KIS_APP_SECRET
      ? new KisClient({ appKey: this.env.KIS_APP_KEY, appSecret: this.env.KIS_APP_SECRET })
      : null;

  async process(_job: Job): Promise<MarketSnapshotJobResult> {
    const sync = this.kisClient ? await syncMarketSnapshots(this.db, this.kisClient) : null;
    const rescore = await rescoreConnectionsForMarketReaction(
      this.db,
      scoringConfig as unknown as ScoringConfig,
      scoringConfig.marketReaction as MarketReactionConfig,
    );
    return { sync, rescore };
  }
}
