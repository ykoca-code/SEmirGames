/* ==========================================================================
   SEmirK Games - Service Worker
   - Cache-first with network fallback
   - Pre-caches the catalog shell so the site opens offline once installed
   - Cache key bumps with each release so updates are picked up
   ========================================================================== */

const CACHE_VERSION = "v1.40.0";
const CACHE_NAME = "semirk-" + CACHE_VERSION;

// Shell files that the catalog needs to load. Game-specific files load on
// demand and get cached on first fetch.
const PRECACHE = [
  "./",
  "index.html",
  "css/style.css",
  "js/main.js",
  "js/version.js",
  "js/leaderboard.js",
  "js/pwa-back.js",
  "games/games.json",
  "assets/icons/logo.svg",
  "assets/icons/SemirkLogo.png",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith("semirk-") && n !== CACHE_NAME)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (
            response &&
            response.status === 200 &&
            response.type === "basic"
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
