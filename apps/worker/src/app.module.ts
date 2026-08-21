import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { loadEnv } from '@gukjang/core';
import { HealthController } from './health/health.controller';
import { PipelineModule } from './pipeline/pipeline.module';

const env = loadEnv();
const redisUrl = new URL(env.REDIS_URL);

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
      },
    }),
    PipelineModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
