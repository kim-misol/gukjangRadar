import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NewsCollectProcessor } from './news-collect.processor';
import { NewsClusterProcessor } from './news-cluster.processor';
import { NewsAnalyzeProcessor } from './news-analyze.processor';
import { ConnectionBuildProcessor } from './connection-build.processor';
import { AlertDispatchProcessor } from './alert-dispatch.processor';
import { PipelineSchedulerService } from './pipeline-scheduler.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'news.collect' },
      { name: 'news.cluster' },
      { name: 'news.analyze' },
      { name: 'connection.build' },
      { name: 'alert.dispatch' },
    ),
  ],
  providers: [
    NewsCollectProcessor,
    NewsClusterProcessor,
    NewsAnalyzeProcessor,
    ConnectionBuildProcessor,
    AlertDispatchProcessor,
    PipelineSchedulerService,
  ],
})
export class PipelineModule {}
