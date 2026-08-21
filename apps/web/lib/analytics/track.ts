'use client';

import {
  buildAnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsEventPayloads,
} from './events';

/**
 * T5.3 — 실 분석 프로바이더가 정해지기 전까지의 전송 계층. `sendBeacon`으로 자체 스텁
 * 엔드포인트(`/api/v1/analytics/events`)에 보낸다 — 프로바이더가 정해지면 이 함수 내부만
 * 바꾸면 호출부(컴포넌트)는 그대로다.
 */
export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  payload: AnalyticsEventPayloads[N],
): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  const event = buildAnalyticsEvent(name, payload);
  navigator.sendBeacon('/api/v1/analytics/events', JSON.stringify(event));
}
