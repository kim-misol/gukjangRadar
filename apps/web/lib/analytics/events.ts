/**
 * T5.3 — 분석 이벤트 taxonomy 설계 (docs/14-backlog.md EPIC5: "카드조회/그래프열기/공유/
 * 피드백/알림등록"). 실제 분석 백엔드(PostHog/GA4 등)는 아직 미정(docs/15 W8 참고) —
 * 지금은 이벤트 모양과 발생 지점만 확정해 UI에 배선해 두고, 전송 쪽(track.ts)만
 * 나중에 실 프로바이더로 교체하면 되게 분리했다.
 */
import type { FeedbackKind } from '@gukjang/spec';
export const ANALYTICS_EVENTS = [
  'card_view',
  'graph_open',
  'share',
  'feedback_submit',
  'alert_register',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsEventPayloads {
  /** 뉴스 카드를 눌러 상세로 들어감 */
  card_view: { clusterId: number; source: 'home' | 'discovery' | 'search' };
  /** 뉴스 상세의 연결 그래프가 화면에 나타남 */
  graph_open: { clusterId: number };
  /** 공유 이미지/링크 복사 */
  share: { connectionId: number; channel: 'clipboard' | 'image' };
  /** 연결 피드백(👍/🤔) 제출 */
  feedback_submit: { connectionId: number; kind: FeedbackKind };
  /** 알림 키워드 등록 */
  alert_register: { minScore: number; includeMeme: boolean };
}

export interface AnalyticsEvent<N extends AnalyticsEventName = AnalyticsEventName> {
  name: N;
  payload: AnalyticsEventPayloads[N];
  ts: string;
}

/** 순수 함수 — 이벤트 조립만 담당, 전송(IO)은 track.ts가 한다. */
export function buildAnalyticsEvent<N extends AnalyticsEventName>(
  name: N,
  payload: AnalyticsEventPayloads[N],
  now: Date = new Date(),
): AnalyticsEvent<N> {
  return { name, payload, ts: now.toISOString() };
}
