const CACHE = "photonic-shell-v1";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./fonts/ibm-plex-sans-cyrillic-400.woff2",
  "./fonts/ibm-plex-sans-cyrillic-500.woff2",
  "./fonts/ibm-plex-sans-cyrillic-600.woff2",
  "./fonts/ibm-plex-sans-latin-400.woff2",
  "./fonts/ibm-plex-sans-latin-500.woff2",
  "./fonts/ibm-plex-sans-latin-600.woff2",
  "./fonts/instrument-serif-latin-400.woff2",
  "./fonts/instrument-serif-latin-400-italic.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.protocol === "blob:") return;

  const base = new URL("./", self.registration.scope).pathname.replace(/\/$/, "");
  const underBase = (prefix) => url.pathname.startsWith(`${base}${prefix}`);

  if (
    underBase("/_next/static/") ||
    underBase("/fonts/") ||
    underBase("/icons/") ||
    underBase("/assets/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    const cache = await caches.open(CACHE);
    await cache.put(request, copy);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match("./index.html");
  }
}
