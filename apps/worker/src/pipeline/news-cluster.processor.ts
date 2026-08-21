/**
 * T2.1.2+1.3 — `news.cluster` 큐 워커. docs/11-pipeline.md §1: 동시성 1(순서 보장), 재시도 3.
 * 트리거는 news.collect(①) 완료 — NewsCollectProcessor가 매 실행 후 잡을 큐잉한다.
 * 새로 만든 클러스터마다 `news.analyze`(⑤⑥)를 큐잉한다 — 트리거가 "④ 신규 클러스터"이기 때문(§1).
 */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getDb } from '@gukjang/db';
import { clusterNewArticles, type ClusterNewsResult } from '../collectors/cluster-news';
import type { NewsAnalyzeJobData } from './news-analyze.processor';

@Processor('news.cluster', { concurrency: 1 })
export class NewsClusterProcessor extends WorkerHost {
  private readonly db = getDb();

  constructor(
    @InjectQueue('news.analyze') private readonly analyzeQueue: Queue<NewsAnalyzeJobData>,
  ) {
    super();
  }

  async process(_job: Job): Promise<ClusterNewsResult> {
    const result = await clusterNewArticles(this.db);
    for (const clusterId of result.createdClusterIds) {
      await this.analyzeQueue.add('analyze', { clusterId });
    }
    return result;
  }
}
