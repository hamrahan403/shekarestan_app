const CACHE_NAME = 'shekarestan-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. فقط درخواست‌های GET رو مدیریت کن (POST، PUT و DELETE رو ول کن)
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. درخواست‌های خارج از سایت (مثل jsDelivr) رو مدیریت نکن
  if (url.origin !== location.origin) {
    return;
  }

  // 3. برای فایل‌های ثابت خود سایت: اول کش، اگر نبود شبکه
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // فقط پاسخ‌های موفق و از نوع basic رو کش کن
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return new Response('', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
    })
  );
});
