import { defineConfig } from 'drizzle-kit';
import { loadEnv } from '@gukjang/core';

const env = loadEnv();

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
