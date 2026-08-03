/* R2·FIT service worker.
 *
 * Scope is deliberately narrow. This app is server-rendered and every page is
 * behind a session, so caching HTML would be a correctness bug waiting to
 * happen: a stale shell can show yesterday's totals, and on a shared device it
 * could show the previous account's. So:
 *
 *   /_next/static/*, /icons/*, fonts  →  cache-first  (content-hashed, immutable)
 *   navigations                       →  network-first, /offline as the fallback
 *   /api/*                            →  never touched
 *
 * The win is start-up latency on a cold home-screen launch (the JS/CSS is
 * already on disk) plus a real offline screen instead of Safari's dinosaur.
 */

const VERSION = "v1";
const STATIC_CACHE = `r2fit-static-${VERSION}`;
const SHELL_CACHE = `r2fit-shell-${VERSION}`;

const SHELL = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is all-or-nothing; one 404 during a deploy would leave us with no
      // offline page at all, so each entry is allowed to fail on its own.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("r2fit-") && k !== STATIC_CACHE && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Lets the page trigger an immediate swap after it detects a new worker.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isImmutableAsset(url) {
  if (url.origin === self.location.origin) {
    return (
      url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/")
    );
  }
  return url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com";
}

// Every deploy mints a fresh set of content-hashed chunk URLs, and the old ones
// are never requested again — so without a cap this cache only ever grows. That
// matters more than the disk it wastes: when a site hits its storage quota the
// browser evicts the WHOLE origin, and this app keeps meals, daily flags, and
// the food catalogue in localStorage. Losing that to stale JS would be absurd.
//
// Rough LRU: keys() returns insertion order, so dropping from the front sheds
// the oldest deploys' chunks first.
const STATIC_MAX_ENTRIES = 150;

async function trimStaticCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - STATIC_MAX_ENTRIES;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Opaque (cross-origin font) responses have status 0 — still worth keeping.
  if (response && (response.ok || response.type === "opaque")) {
    const cache = await caches.open(STATIC_CACHE);
    // Not awaited: the page is waiting on this asset, and neither the write nor
    // the trim should sit in front of it. The clone is taken synchronously, so
    // returning `response` first is safe.
    void cache.put(request, response.clone()).then(() => trimStaticCache(cache));
  }
  return response;
}

async function navigationWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match("/offline");
    if (offline) return offline;
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // User data. Always live; an offline read here would be worse than an error.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationWithOfflineFallback(request));
  }
});
