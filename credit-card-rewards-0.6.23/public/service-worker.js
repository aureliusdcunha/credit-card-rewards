const CACHE_PREFIX = "rewards-intelligence-shell-";
const CACHE_VERSION = "0.6.23";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const NAVIGATION_TIMEOUT_MS = 3500;
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/cards.html",
  "/calculator.html",
  "/compare.html",
  "/sources.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/css/app.css?v=0.6.23.0",
  "/js/api.js?v=0.6.23.0",
  "/js/layout.js?v=0.6.23.0",
  "/js/dashboard.js?v=0.6.23.0",
  "/js/source-review-prefill.js?v=0.6.23.0",
  "/js/card-modal.js?v=0.6.23.0",
  "/js/cards.js?v=0.6.23.0",
  "/js/calculator.js?v=0.6.23.0",
  "/js/compare.js?v=0.6.23.0",
  "/js/sources.js?v=0.6.23.0"
];

const STATIC_PATHS = new Set([
  "/", "/index.html", "/cards.html", "/calculator.html", "/compare.html",
  "/sources.html", "/offline.html", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/css/app.css", "/js/api.js", "/js/layout.js", "/js/dashboard.js",
  "/js/source-review-prefill.js", "/js/card-modal.js", "/js/cards.js",
  "/js/calculator.js", "/js/compare.js", "/js/sources.js"
]);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Precache independently so one optional asset outage doesn't block installation.
    await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses: these include admin-gated drafts and live card data.
  // Allow the browser/network to handle API fetches directly.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      // Network first so a new release is picked up, but never make the person wait on a
      // stalled mobile connection: after NAVIGATION_TIMEOUT_MS fall back to the cached page
      // (when there is one) and refresh the cache from the late response in the background.
      const network = fetch(request);
      network.catch(() => {});
      let timedOut = false;
      try {
        const response = await Promise.race([
          network,
          new Promise((_, reject) => setTimeout(() => { timedOut = true; reject(new Error("slow network")); }, NAVIGATION_TIMEOUT_MS))
        ]);
        if (response && response.ok && response.type === "basic" && STATIC_PATHS.has(url.pathname)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(url.pathname, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const samePage = await cache.match(url.pathname);
        if (samePage && timedOut) {
          event.waitUntil(network.then(late => {
            if (late && late.ok && late.type === "basic" && STATIC_PATHS.has(url.pathname)) return cache.put(url.pathname, late.clone());
          }).catch(() => {}));
          return samePage;
        }
        if (timedOut) {
          // Nothing cached for this page yet: waiting for the real response beats an offline screen.
          try { return await network; } catch { /* fall through to the offline fallbacks */ }
        }
        return samePage ||
          (await cache.match("/index.html")) ||
          (await cache.match("/offline.html")) ||
          new Response("You are offline. Reconnect to use live card data.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      }
    })());
    return;
  }

  if (!STATIC_PATHS.has(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    const networkUpdate = fetch(request).then(response => {
      if (response && response.ok && response.type === "basic") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    });
    if (cached) {
      event.waitUntil(networkUpdate.catch(() => {}));
      return cached;
    }
    try {
      return await networkUpdate;
    } catch {
      return new Response("This app resource is unavailable offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});