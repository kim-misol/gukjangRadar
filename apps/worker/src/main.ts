import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { loadEnv } from '@gukjang/core';
import { AppModule } from './app.module';
import { initSentry } from './monitoring/sentry';

initSentry();

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT);
  console.log(`[worker] listening on :${env.PORT}`);
}

bootstrap().catch((err) => {
  console.error('[worker] bootstrap failed', err);
  Sentry.captureException(err);
  process.exit(1);
});
