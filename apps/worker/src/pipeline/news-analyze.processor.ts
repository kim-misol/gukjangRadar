/**
 * T2.2.2+2.2.3+2.2.4 — `news.analyze` 큐 워커. docs/11 §1: 동시성 4, 재시도 2,
 * 트리거는 "④ 신규 클러스터"(NewsClusterProcessor가 새로 만든 클러스터마다 잡을 큐잉).
 * 요약(⑤) → 개체추출(⑥, ⑦ 정규화·병합 포함)을 순서대로 돌린다 — 개체추출은 요약을 입력으로 쓴다.
 * 개체 추출이 끝나면 `connection.build`(⑧⑨⑩)를 큐잉한다 — 트리거가 "⑥ 완료"이기 때문(§1).
 */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getDb } from '@gukjang/db';
import { loadEnv } from '@gukjang/core';
import { AnthropicLlmClient } from '../llm/anthropic-client';
import { summarizeCluster } from '../analysis/summarize-cluster';
import { extractEntitiesForCluster } from '../analysis/extract-entities';
import type { ConnectionBuildJobData } from './connection-build.processor';

export interface NewsAnalyzeJobData {
  clusterId: number;
}

export interface NewsAnalyzeResult {
  summary: Awaited<ReturnType<typeof summarizeCluster>>;
  entities: Awaited<ReturnType<typeof extractEntitiesForCluster>> | null;
}

@Processor('news.analyze', { concurrency: 4 })
export class NewsAnalyzeProcessor extends WorkerHost {
  private readonly db = getDb();
  private readonly env = loadEnv();
  private readonly llmClient = new AnthropicLlmClient({ apiKey: this.env.ANTHROPIC_API_KEY });

  constructor(
    @InjectQueue('connection.build')
    private readonly connectionBuildQueue: Queue<ConnectionBuildJobData>,
  ) {
    super();
  }

  async process(job: Job<NewsAnalyzeJobData>): Promise<NewsAnalyzeResult> {
    const { clusterId } = job.data;
    const config = { model: this.env.LLM_MODEL, dailyCostCapUsd: this.env.LLM_DAILY_COST_CAP_USD };

    const summary = await summarizeCluster(this.db, this.llmClient, clusterId, config);
    if (summary.status !== 'OK' && summary.status !== 'CACHED') {
      // 요약이 없으면 개체 추출 입력(headline+summary)을 만들 수 없다 — 여기서 멈춘다.
      return { summary, entities: null };
    }

    const entities = await extractEntitiesForCluster(this.db, this.llmClient, clusterId, config);
    if (entities.status === 'OK' || entities.status === 'CACHED') {
      await this.connectionBuildQueue.add('build', { clusterId });
    }
    return { summary, entities };
  }
}
