/**
 * T2.1.1~1.3 — 뉴스 수집·정규화·클러스터링에 필요한 순수 타입.
 * DB row 타입은 packages/db의 drizzle 추론 타입을 그대로 쓴다 (여기 중복 정의하지 않음).
 */

/** RSS/Atom 피드에서 파싱한 원시 아이템 (worker의 RssClient가 만든다). */
export interface RssFeedItem {
  title: string;
  link: string;
  /** 피드에 실린 원문 발행시각 문자열. 파싱 실패/부재 시 null. */
  pubDate: string | null;
  description?: string | null;
}

/** news_article insert에 바로 넣을 수 있는 형태로 정제된 입력. */
export interface NewsArticleInsertInput {
  sourceId: number;
  url: string;
  /** docs/11 §2-② 정규화를 거친 제목. */
  title: string;
  /** 200자 이하로 자른 리드. 노출 금지(요약 입력용 임시). */
  lead: string | null;
  publishedAt: Date;
  /** docs/11 §2-③ simhash 중복 제거용. 32비트. */
  simhash: number;
}

/** 클러스터링 매칭 대상 — 열린 클러스터 하나. */
export interface ClusterCandidate {
  id: number;
  /** headline을 토큰화한 값 (자카드 비교용). */
  tokens: string[];
  lastSeenAt: Date;
  /** 2차(임베딩) 단계용. 아직 임베딩 공급자가 없으면 없다. */
  embedding?: number[] | null;
}

export interface ClusterMatchOptions {
  /** docs/11 §2-④: 시간 창 24시간. */
  windowHours?: number;
  /** docs/11 §2-④: 1차 자카드 임계값 0.5. */
  jaccardThreshold?: number;
  /** docs/11 §2-④: 2차 임베딩 코사인 임계값 0.88. */
  cosineThreshold?: number;
}

export interface RepresentativeCandidate {
  /** news_source.tier — 숫자가 작을수록 신뢰도가 높다 (1=통신사/주요지). */
  sourceTier: number;
  publishedAt: Date;
}

export interface HeatScoreConfig {
  /** log(article_count) 밑. docs/11 공식은 log2. */
  articleCountLogBase: number;
  /** log(article_count) 항의 계수. */
  articleCountCoef: number;
  /** source_tier_min별 가산점. 키는 tier 숫자의 문자열. */
  tierBonus: Record<string, number>;
  /** 최근 1시간 신규 기사 수(속도)에 곱하는 계수. */
  velocityCoef: number;
}

export interface HeatScoreInput {
  articleCount: number;
  sourceTierMin: number | null;
  /** 최근 1시간 이내 새로 묶인 기사 수 ("속도"). */
  recentHourIncrease: number;
}
