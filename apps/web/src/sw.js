/* global self, caches, fetch, Response */
/**
 * freenotes service worker. Built by Vite from this template: the build id and the list of emitted
 * assets are filled in at build time, so every deploy ships a new worker that precaches the whole
 * app shell. Nothing under /api is ever cached.
 */
const BUILD = "__BUILD__";
const CACHE = `freenotes-${BUILD}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("freenotes-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data, never cached

  // The app shell: fresh when online, cached when not.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } }))),
    );
    return;
  }

  // Hashed build assets are immutable: cache first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((res) => cacheOk(request, res))));
    return;
  }

  // Everything else same-origin (icons, manifest): serve cached, refresh in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const refresh = fetch(request)
        .then((res) => cacheOk(request, res))
        .catch(() => hit);
      return hit ?? refresh;
    }),
  );
});

function cacheOk(request, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return res;
}
