const CACHE_NAME = "statuspc-shell-v1";
const STATIC_CACHE = "statuspc-static-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([caches.open(CACHE_NAME).then((cache) => cache.addAll(["/"])), caches.open(STATIC_CACHE)]));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE_NAME, STATIC_CACHE].includes(key)).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const update = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      return cached || update;
    }));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && request.mode === "navigate") caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone()));
    return response;
  }).catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error()));
});
