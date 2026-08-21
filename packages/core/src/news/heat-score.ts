/**
 * T2.1.3 — heat_score 계산 (docs/11-pipeline.md §2-④).
 * `heat_score = log_base(article_count) × articleCountCoef + tierBonus + recentHourIncrease × velocityCoef`
 * 계수는 코드에 하드코딩하지 않고 spec/scoring.config.json의 heatScore를 읽어 넘긴다 (CLAUDE.md §3).
 */
import type { HeatScoreConfig, HeatScoreInput } from './types';

export function computeHeatScore(input: HeatScoreInput, config: HeatScoreConfig): number {
  const articleCount = Math.max(1, input.articleCount);
  const base =
    (Math.log(articleCount) / Math.log(config.articleCountLogBase)) * config.articleCountCoef;
  const tierBonus =
    input.sourceTierMin !== null ? (config.tierBonus[String(input.sourceTierMin)] ?? 0) : 0;
  const velocity = input.recentHourIncrease * config.velocityCoef;

  const raw = base + tierBonus + velocity;
  return Math.round(raw * 100) / 100;
}
