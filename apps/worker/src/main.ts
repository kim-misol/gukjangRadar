import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@gukjang/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT);
  console.log(`[worker] listening on :${env.PORT}`);
}

bootstrap().catch((err) => {
  console.error('[worker] bootstrap failed', err);
  process.exit(1);
});
