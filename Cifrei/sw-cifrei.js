// Service Worker do Cifrei — notificações + network-first para HTML
const VERSION = 'v4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

// Intercepta requests — NUNCA cacheia o HTML principal
// Requests cross-origin (Firebase, Gist, Google APIs) passam direto sem interferência
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Não intercepta cross-origin — evita quebrar imports do Firebase SDK e fetches de API
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(cached => cached || Response.error())
    )
  );
});

// Clique na notificação
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
