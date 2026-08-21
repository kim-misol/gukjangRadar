/**
 * T3.3.4 — `alert.dispatch` 큐 워커. docs/11 §1: 동시성 2, 재시도 3.
 * 트리거는 ⑫ 완료(ConnectionBuildProcessor가 연결을 저장한 직후 큐잉).
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getDb } from '@gukjang/db';
import { loadEnv } from '@gukjang/core';
import webpush from 'web-push';
import { dispatchAlertsForCluster, type AlertDispatchSummary } from '../alerts/dispatch-alerts';

export interface AlertDispatchJobData {
  clusterId: number;
}

@Processor('alert.dispatch', { concurrency: 2 })
export class AlertDispatchProcessor extends WorkerHost {
  private readonly db = getDb();
  private readonly env = loadEnv();
  private vapidReady = false;

  private ensureVapid(): boolean {
    if (this.vapidReady) return true;
    if (!this.env.VAPID_PUBLIC_KEY || !this.env.VAPID_PRIVATE_KEY) return false;
    webpush.setVapidDetails(
      this.env.VAPID_SUBJECT,
      this.env.VAPID_PUBLIC_KEY,
      this.env.VAPID_PRIVATE_KEY,
    );
    this.vapidReady = true;
    return true;
  }

  async process(job: Job<AlertDispatchJobData>): Promise<AlertDispatchSummary> {
    if (!this.ensureVapid()) {
      // VAPID 키가 없는 로컬 환경 등 — 매칭/판정까지는 여전히 유효하니 조용히 스킵하지 않고
      // 명시적으로 실패시켜 재시도 큐에 쌓이지 않게 한다(설정 누락은 코드 버그가 아니라 배포 이슈).
      throw new Error('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY가 설정되지 않았습니다.');
    }

    return dispatchAlertsForCluster(
      {
        db: this.db,
        now: new Date(),
        sendPush: async (subscription, payload) => {
          try {
            await webpush.sendNotification(subscription, JSON.stringify(payload));
            return { ok: true };
          } catch (err) {
            const statusCode =
              typeof err === 'object' && err !== null && 'statusCode' in err
                ? (err as { statusCode?: number }).statusCode
                : undefined;
            return { ok: false, statusCode };
          }
        },
      },
      job.data.clusterId,
    );
  }
}
