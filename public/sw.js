/*
 * 离线可用，但绝不把旧版本焊死：
 * - 页面导航（index.html）走「网络优先」：能联网就取最新的外壳，顺手更新缓存；
 *   断网才回落到缓存。以前这里也是缓存优先，结果本地重建之后浏览器永远吃旧代码。
 * - 带内容哈希的静态资源（assets/index-xxxx.js）仍然缓存优先，离线也快。
 * - 缓存名换一次，激活时把上一版外壳整个删掉。
 */
const CACHE = 'killquestion-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  // 外壳：网络优先，失败才用缓存（离线时还能打开）
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // 资源：缓存优先（文件名带 hash，内容变了文件名就变了）
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => new Response('', { status: 504, statusText: 'offline' }));
    }),
  );
});
