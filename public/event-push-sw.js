self.addEventListener('push', (event) => {
  const fallback = {
    title: 'helpsaveandroid.org',
    body: 'event update',
    url: '/',
    tag: 'hsa-event',
  };
  let payload = fallback;

  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || fallback.title, {
      body: payload.body || fallback.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.tag || fallback.tag,
      data: {
        url: payload.url || fallback.url,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
