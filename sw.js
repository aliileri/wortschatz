// Full offline app shell. This app has no server to fall back to, so after
// the first successful load everything - including the 1057-word dataset -
// must be servable straight from the cache, airplane mode included.
const CACHE_NAME = "wortschatz-shell-v7";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./data/words.json",
  "./icons/icon-180.png",
  "./icons/icon-512.png",
  "./js/app.js",
  "./js/studyFlow.js",
  "./js/data/db.js",
  "./js/data/settings.js",
  "./js/data/importWords.js",
  "./js/data/planner.js",
  "./js/data/stats.js",
  "./js/data/backup.js",
  "./js/data/clock.js",
  "./js/logic/workdays.js",
  "./js/logic/leitner.js",
  "./js/logic/direction.js",
  "./js/logic/triage.js",
  "./js/logic/cloze.js",
  "./js/logic/answerEval.js",
  "./js/logic/questionTypes.js",
  "./js/logic/seededRandom.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Single-page app: any navigation (including a deep #/-hash reload) is
  // served from the cached shell so hash routing can take over offline.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
