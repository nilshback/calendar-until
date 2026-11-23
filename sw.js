const cacheName = 'daybook-' + self.registration.scope + '-v8';
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(['./','./index.html','./app.js','./motion.js','./calendar.css','./sync.js','./app.webmanifest','./icon-192.png','./icon-512.png'].map(path => new Request(path,{cache:'reload'})))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    const saved = await cache.match(event.request,{ignoreSearch:true});
    return saved || fetch(event.request);
  }));
});
