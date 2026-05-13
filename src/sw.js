import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Injected by VitePWA
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cache Google Fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gfonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);
registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gfonts-static-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

// ─── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'RotinUp', body: event.data.text() }; }

  const title   = data.title  || 'RotinUp 🚀';
  const options = {
    body:    data.body    || 'Você tem missões esperando por você!',
    icon:    '/icon.svg',
    badge:   '/icon.svg',
    tag:     data.tag     || 'rotinup-notification',
    data:    { url: data.url || '/' },
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); return existing.navigate(targetUrl); }
      return clients.openWindow(targetUrl);
    })
  );
});
