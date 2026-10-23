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

// Recebe push e exibe notificação
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) { data = { title: 'Cifrei', body: e.data?.text() || '' }; }
  const title = data.title || 'Cifrei';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    tag: data.tag || 'cifrei-push',
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(self.location.origin) && 'focus' in c) { c.focus(); return; }
      }
      return self.clients.openWindow(url);
    })
  );
});
