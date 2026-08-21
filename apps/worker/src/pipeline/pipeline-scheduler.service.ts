/**
 * docs/11-pipeline.md §1: `news.collect`는 07:00~20:00(KST) 동안 2분마다 돈다.
 * cron 필드 자체에 시간대(7-20)를 넣어 "장중에만"을 표현한다.
 * `market.snapshot`(§2 ⑪, "5분 배치, 장중")도 같은 시간대 창에서 5분마다 돈다 — 실제
 * 개장 여부(주말·공휴일 포함)는 `getMarketStatus`가 잡 실행 시점에 다시 정확히 판별한다.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

const NEWS_COLLECT_CRON = '*/2 7-20 * * *';
const MARKET_SNAPSHOT_CRON = '*/5 7-20 * * *';

@Injectable()
export class PipelineSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue('news.collect') private readonly collectQueue: Queue,
    @InjectQueue('market.snapshot') private readonly marketSnapshotQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.collectQueue.add(
      'collect',
      {},
      {
        repeat: { pattern: NEWS_COLLECT_CRON, tz: 'Asia/Seoul' },
        jobId: 'news-collect-cron',
      },
    );
    await this.marketSnapshotQueue.add(
      'snapshot',
      {},
      {
        repeat: { pattern: MARKET_SNAPSHOT_CRON, tz: 'Asia/Seoul' },
        jobId: 'market-snapshot-cron',
      },
    );
  }
}
