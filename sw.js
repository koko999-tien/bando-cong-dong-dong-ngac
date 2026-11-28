const CACHE_NAME = 'vn-resilience-gis-v48';
const CORE_ASSETS = [
  './',
  './index.html',
  './phap-ly.html',
  './citizen.css',
  './citizen-logic.js',
  './national-app.js',
  './platform/regions/vietnam-directory.js',
  './platform/data/vietnam-verified-hotspots.js',
  './platform/gis/hydro-surface.js',
  './platform/gis/hydro-route.js',
  './platform/gis/vn2000.js',
  './platform/safety/sos-dispatch-engine.js',
  './platform/ai/distress-inference.js',
  './platform/ai/national-intelligence.js',
  './chuyen-gia.html',
  './styles.css',
  './config.js',
  './humg-data.js',
  './dem-grid-2km.js',
  './gis-utils.js',
  './knowledge-engine.js',
  './app.js',
  './admin.js',
  './khao-sat.html',
  './cam-nang-1-cham.html',
  './infographics-va-ban-tin.html',
  './thuyet-trinh.html',
  './du-lieu-mo.html',
  './phieu-thuc-dia.html',
  './admin.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-96.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/turf/turf.min.js',
  './vendor/chartjs/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('overpass-api.de') ||
    url.hostname.includes('photon.komoot.io') ||
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('rainviewer.com') ||
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('opentopomap.org') ||
    url.hostname.includes('workers.dev')
  ) {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'VN Resilience SOS', body: 'Có yêu cầu hỗ trợ giao thông thiên tai mới trong ô lưới trực của bạn.', url: './index.html#sos' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore malformed push
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-96.png',
      tag: 'vn-resilience-sos-alert',
      data: { url: data.url || './index.html#sos' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || './index.html#sos';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
