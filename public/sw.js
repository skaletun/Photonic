const CACHE = "photonic-shell-v3";
const INBOX = "photonic-inbox";

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
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== INBOX).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method === "POST") {
    const url = new URL(request.url);
    const share = new URL("./share", self.registration.scope);
    if (url.pathname === share.pathname || url.pathname === `${share.pathname}/`) {
      event.respondWith(handleShare(request));
    }
    return;
  }
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

async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = [...form.getAll("images"), ...form.getAll("file")].filter(
      (item) => item instanceof File && item.size > 0,
    );
    const cache = await caches.open(INBOX);
    const existing = await cache.keys();
    await Promise.all(existing.map((key) => cache.delete(key)));
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      await cache.put(
        `./inbox/${String(i).padStart(3, "0")}`,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name || `shared-${i}`),
          },
        }),
      );
    }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: "photonic-share", count: files.length });
    }
  } catch {
    // Still land on the app shell.
  }
  return Response.redirect(new URL("./", self.registration.scope).href, 303);
}

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
