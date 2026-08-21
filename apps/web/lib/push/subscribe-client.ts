'use client';

/** T3.3.3 — 서비스워커 등록 + PushManager 구독 + 서버 등록. 브라우저 전용(SSR에서 호출 금지). */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSubscribeResult = 'SUBSCRIBED' | 'PERMISSION_DENIED' | 'UNSUPPORTED' | 'ERROR';

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscribeResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'UNSUPPORTED';
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'PERMISSION_DENIED';

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const json = subscription.toJSON();

    const res = await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });
    return res.ok ? 'SUBSCRIBED' : 'ERROR';
  } catch {
    return 'ERROR';
  }
}
