/**
 * T2.1.2+1.3 — `news.cluster` 큐 워커. docs/11-pipeline.md §1: 동시성 1(순서 보장), 재시도 3.
 * 트리거는 news.collect(①) 완료 — NewsCollectProcessor가 매 실행 후 잡을 큐잉한다.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getDb } from '@gukjang/db';
import { clusterNewArticles, type ClusterNewsResult } from '../collectors/cluster-news';

@Processor('news.cluster', { concurrency: 1 })
export class NewsClusterProcessor extends WorkerHost {
  private readonly db = getDb();

  async process(_job: Job): Promise<ClusterNewsResult> {
    return clusterNewArticles(this.db);
  }
}
