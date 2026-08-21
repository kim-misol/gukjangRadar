/**
 * T2.3.1~2.3.8 — `connection.build` 큐 워커. docs/11 §1: 동시성 4, 재시도 2,
 * 트리거는 news.analyze(⑥ 개체추출) 완료 — NewsAnalyzeProcessor가 매 실행 후 잡을 큐잉한다.
 * 반증검사(⑩·T2.3.5)는 W5 범위에서 제외(docs/15).
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getDb } from '@gukjang/db';
import { loadEnv } from '@gukjang/core';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type {
  KeywordMatchConfig,
  MemeConfig,
  RecallConfig,
  ReviewTriggersConfig,
  ScoringConfig,
} from '@gukjang/core';
import { AnthropicLlmClient } from '../llm/anthropic-client';
import { buildConnectionsForCluster } from '../connections/build-connections';

export interface ConnectionBuildJobData {
  clusterId: number;
}

@Processor('connection.build', { concurrency: 4 })
export class ConnectionBuildProcessor extends WorkerHost {
  private readonly db = getDb();
  private readonly env = loadEnv();
  private readonly llmClient = new AnthropicLlmClient({ apiKey: this.env.ANTHROPIC_API_KEY });

  async process(
    job: Job<ConnectionBuildJobData>,
  ): Promise<ReturnType<typeof buildConnectionsForCluster>> {
    const { clusterId } = job.data;
    return buildConnectionsForCluster(this.db, this.llmClient, clusterId, {
      matchModel: this.env.LLM_MATCH_MODEL,
      dailyCostCapUsd: this.env.LLM_DAILY_COST_CAP_USD,
      recall: scoringConfig.recall as RecallConfig,
      keywordMatch: scoringConfig.keywordMatch as KeywordMatchConfig,
      meme: scoringConfig.meme as MemeConfig,
      scoring: scoringConfig as unknown as ScoringConfig,
      reviewTriggers: scoringConfig.reviewTriggers as ReviewTriggersConfig,
    });
  }
}
