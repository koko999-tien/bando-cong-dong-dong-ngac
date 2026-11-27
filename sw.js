const CACHE_NAME = 'humg-community-gis-v14';
const CORE_ASSETS = [
  './',
  './index.html',
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
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/turf/turf.min.js'
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

  // Không bao giờ lưu bộ nhớ đệm với API động (/api/community, Google Apps Script, Nominatim, Open-Meteo)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('api.open-meteo.com')
  ) {
    return;
  }

  // Với tệp lõi ứng dụng: Network-first, rơi về Cache nếu mất mạng / mưa bão yếu 4G
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
