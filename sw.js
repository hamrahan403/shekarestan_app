from pathlib import Path

src = Path("/mnt/data/sw (1).js")
out = Path("/mnt/data/sw-fixed.js")

text = src.read_text(encoding="utf-8")

old = """  // برای فایل‌های ثابت (آیکون، منیفست، فونت): اول کش (سریع)، اگه نبود برو سراغ شبکه
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.includes('jsdelivr'))) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      }).catch(() => cached);
    })
  );"""

new = """  // درخواست‌های خارج از سایت (مثل jsDelivr) را Service Worker مدیریت نکند
  // تا خطای CDN باعث خراب شدن پاسخ FetchEvent نشود.
  if (url.origin !== location.origin) {
    return;
  }

  // برای فایل‌های ثابت خود سایت: اول کش، اگر نبود شبکه
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, resClone);
            });
          }
          return res;
        })
        .catch(() => {
          // هیچ‌وقت undefined به respondWith نده
          return new Response('', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
    })
  );"""

if old not in text:
    raise RuntimeError("بخش موردنظر در فایل پیدا نشد؛ فایل را تغییر ندادم.")

out.write_text(text.replace(old, new), encoding="utf-8")
print(f"فایل آماده شد: {out}")
