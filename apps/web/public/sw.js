// T3.3.3 — 웹푸시 서비스워커. docs/05-screen-specs.md S7 페이로드 형식을 그대로 표시한다.
self.addEventListener('push', (event) => {
  let payload = { title: '국장레이더', body: '새 연결이 발견됐습니다.', url: '/' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      icon: '/icons/192',
      badge: '/icons/192',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});
