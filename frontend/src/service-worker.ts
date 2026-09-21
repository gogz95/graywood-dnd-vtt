// src/service-worker.ts
// Offline PWA Service Worker: Pre-caches application shell, network-first with cache fallback

const CACHE_NAME = 'vtt-offline-cache-v1';

const CORE_ASSETS = [
  '/',
  '/play',
  '/projector',
  '/manifest.json',
  '/favicon.png',
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
  (self as any).skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  (self as any).clients.claim();
});

self.addEventListener('fetch', (event: any) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip WebSocket connections, non-GET requests, or chrome extensions
  if (req.method !== 'GET' || url.protocol === 'ws:' || url.protocol === 'wss:' || !url.protocol.startsWith('http')) {
    return;
  }

  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Fallback to root shell for navigation requests
        if (req.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return new Response('Offline - No cached resource available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
        });
      })
  );
});
