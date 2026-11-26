/* R2·FIT service worker — fast cache-first assets & instant shell fallback.
 *
 * Strategy:
 *   /_next/static/*, /icons/*, /avatars/*, /ocr/*, fonts → cache-first
 *   App navigations (/, /meal, /workout, /companion, /settings, /dashboard/*)
 *     → network-with-fast-timeout (1.1 s) when cached, falling back instantly
 *       to cached HTML while refreshing the cache in the background!
 *   /login, /register, sign-out → always live network AND wipes PAGE_CACHE
 *       so a shared device can never see another user's cached shell.
 *   /api/* → never intercepted (client stores handle localStorage caching).
 */

const VERSION = "v15-card-stage-reveal";
const STATIC_CACHE = `r2fit-static-${VERSION}`;
const SHELL_CACHE = `r2fit-shell-${VERSION}`;
const PAGE_CACHE = `r2fit-pages-${VERSION}`;

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
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith("r2fit-") &&
                k !== STATIC_CACHE &&
                k !== SHELL_CACHE &&
                k !== PAGE_CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data === "clear-pages") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

function isImmutableAsset(url) {
  if (url.origin === self.location.origin) {
    return (
      url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/avatars/v2/") ||
      url.pathname.startsWith("/avatars/v3/") ||
    url.pathname.startsWith("/avatars/v5/") ||
      url.pathname.startsWith("/avatars/welcome-v1/") ||
      url.pathname.startsWith("/ocr/")
    );
  }
  return (
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "fonts.googleapis.com"
  );
}

function isCacheableAppPage(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (
    p.startsWith("/login") ||
    p.startsWith("/register") ||
    p.startsWith("/welcome") ||
    p.startsWith("/onboarding") ||
    p.startsWith("/api/") ||
    p.startsWith("/offline")
  ) {
    return false;
  }
  return true;
}

const STATIC_MAX_ENTRIES = 240;
const PAGE_MAX_ENTRIES = 24;

async function trimCache(cache, max) {
  const keys = await cache.keys();
  const excess = keys.length - max;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    const cache = await caches.open(STATIC_CACHE);
    void cache
      .put(request, response.clone())
      .then(() => trimCache(cache, STATIC_MAX_ENTRIES));
  }
  return response;
}

async function navigationHandler(request, url) {
  // Visiting auth screens clears cached authenticated HTML shells immediately.
  if (url.pathname.startsWith("/login") || url.pathname.startsWith("/register")) {
    void caches.delete(PAGE_CACHE);
    try {
      return await fetch(request);
    } catch {
      const offline = await caches.match("/offline");
      return offline || new Response("Offline", { status: 503 });
    }
  }

  const pageCache = await caches.open(PAGE_CACHE);
  const cached = isCacheableAppPage(url) ? await pageCache.match(url.pathname) : null;

  const networkPromise = fetch(request).then((res) => {
    // Only cache real 200 HTML app responses (never redirects to /login).
    if (
      res &&
      res.ok &&
      !res.redirected &&
      isCacheableAppPage(url) &&
      (res.headers.get("content-type") || "").includes("text/html")
    ) {
      void pageCache
        .put(url.pathname, res.clone())
        .then(() => trimCache(pageCache, PAGE_MAX_ENTRIES));
    }
    return res;
  });

  if (cached) {
    // Race network against 650ms fast timeout so poor mobile networks open
    // almost instantaneously from cache while updating fresh HTML in background.
    try {
      return await Promise.race([
        networkPromise,
        new Promise((resolve) => setTimeout(() => resolve(cached), 650)),
      ]);
    } catch {
      return cached;
    }
  }

  try {
    return await networkPromise;
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

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request, url));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "R2·FIT";
  const url = payload.url || (payload.data && payload.data.url) || "/?couple=1";
  const options = {
    body: payload.body || "Ada pesan baru buat kamu 💛",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "r2fit-cheer",
    renotify: true,
    data: { ...(payload.data || {}), url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/?couple=1";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsArr) => {
        const targetAbs = new URL(targetUrl, self.location.origin).href;
        for (const client of clientsArr) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            return client.focus().then((focused) => {
              if (focused && "navigate" in focused && focused.url !== targetAbs) {
                return focused.navigate(targetAbs).catch(() => focused);
              }
              return focused;
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetAbs);
        }
        return undefined;
      }),
  );
});
