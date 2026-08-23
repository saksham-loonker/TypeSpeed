const CACHE_NAME = "typespeed-shell-v8";
const SHELL_ASSETS = [
  "/",
  "/styles.css",
  "/app.js",
  "/src/passages.js",
  "/src/typingAnalysis.js",
  "/src/trainingPlan.js",
  "/src/profileCoach.js",
  "/src/historyArchive.js",
  "/src/coachReport.js",
  "/src/adaptivePractice.js",
  "/src/keyboardModel.js",
  "/src/sessionRules.js",
  "/manifest.webmanifest",
  "/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(error => {
        if (event.request.mode === "navigate") return caches.match("/");
        throw error;
      });
    })
  );
});
