/**
 * docs/11-pipeline.md §1: `news.collect`는 07:00~20:00(KST) 동안 2분마다 돈다.
 * cron 필드 자체에 시간대(7-20)를 넣어 "장중에만"을 표현한다.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

const NEWS_COLLECT_CRON = '*/2 7-20 * * *';

@Injectable()
export class PipelineSchedulerService implements OnModuleInit {
  constructor(@InjectQueue('news.collect') private readonly collectQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.collectQueue.add(
      'collect',
      {},
      {
        repeat: { pattern: NEWS_COLLECT_CRON, tz: 'Asia/Seoul' },
        jobId: 'news-collect-cron',
      },
    );
  }
}
