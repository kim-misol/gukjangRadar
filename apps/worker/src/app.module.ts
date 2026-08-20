import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { loadEnv } from '@gukjang/core';
import { HealthController } from './health/health.controller';

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
    // E2 파이프라인 큐는 실제 잡이 생기는 T2.1.1부터 registerQueue로 추가한다.
  ],
  controllers: [HealthController],
})
export class AppModule {}
