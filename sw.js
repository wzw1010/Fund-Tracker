/* ================================================================
   Fund-Tracker · Service Worker
   作用：缓存核心资源，支持离线访问
   ================================================================ */

// ★★★ 版本号改为 v4，强制更新缓存 ★★★
var CACHE_NAME = 'fund-tracker-v4';

// ★★★ 所有路径加上 /Fund-Tracker/ 前缀 ★★★
var urlsToCache = [
    '/Fund-Tracker/',
    '/Fund-Tracker/index.html',
    '/Fund-Tracker/style.css',
    '/Fund-Tracker/app.js',
    '/Fund-Tracker/manifest.json',
    '/Fund-Tracker/icon-1024.png'
];

// 安装阶段：缓存核心资源
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('[SW] 缓存已打开');
                return cache.addAll(urlsToCache);
            })
            .then(function() {
                console.log('[SW] 所有资源缓存成功');
                return self.skipWaiting();
            })
            .catch(function(error) {
                console.error('[SW] 缓存失败:', error);
            })
    );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function() {
            console.log('[SW] 激活完成，已接管页面');
            return self.clients.claim();
        })
    );
});

// 拦截请求：缓存优先，网络后备
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(function(networkResponse) {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }
                    var responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then(function(cache) {
                            cache.put(event.request, responseToCache);
                        });
                    return networkResponse;
                }).catch(function() {
                    console.warn('[SW] 网络请求失败:', event.request.url);
                });
            })
    );
});