const CACHE_NAME = 'thu-chi-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './manifest.json',
  './icon.png'
];

// Cài đặt SW và lưu cache các tài nguyên tĩnh
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Đang lưu cache...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Ép SW mới cài đặt trở thành active ngay lập tức
  self.skipWaiting();
});

// Xóa cache cũ khi có phiên bản SW mới (CACHE_NAME thay đổi)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[SW] Xóa cache cũ:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  // Ép các tab đang mở sử dụng SW mới
  self.clients.claim();
});

// Chặn các request và trả về từ Cache nếu có, ngược lại gọi Network
self.addEventListener('fetch', (event) => {
  // Chỉ xử lý các request GET
  if (event.request.method !== 'GET') return;
  // Không cache các request gọi API ra ngoài (như Google Apps Script)
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Có trong cache -> trả về liền, đồng thời ngầm fetch bản mới từ network để cập nhật cache
        event.waitUntil(
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          }).catch(() => {})
        );
        return cachedResponse;
      }
      
      // Không có trong cache -> gọi network
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});

// Lắng nghe thông điệp từ trang web (ví dụ: yêu cầu reload)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});