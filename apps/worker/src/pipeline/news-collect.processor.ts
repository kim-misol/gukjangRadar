/**
 * T2.1.1 — `news.collect` 큐 워커. docs/11-pipeline.md §1: 동시성 4, 재시도 3(지수 백오프).
 * 완료되면 `news.cluster`(④)를 큐잉한다 — 트리거가 "① 완료"이기 때문(§1).
 */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getDb } from '@gukjang/db';
import { RssClient } from '../collectors/rss-client';
import { syncNewsCollect, type NewsCollectResult } from '../collectors/sync-news-collect';

@Processor('news.collect', { concurrency: 4 })
export class NewsCollectProcessor extends WorkerHost {
  private readonly db = getDb();
  private readonly client = new RssClient();

  constructor(@InjectQueue('news.cluster') private readonly clusterQueue: Queue) {
    super();
  }

  async process(_job: Job): Promise<NewsCollectResult> {
    const result = await syncNewsCollect(this.db, this.client);
    await this.clusterQueue.add('cluster', {});
    return result;
  }
}
