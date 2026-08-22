/**
 * Offline shell.
 *
 * Cellular at Veenker is not guaranteed, and a mid-round refresh that can't
 * fetch the app would strand a round sitting safely in localStorage.
 *
 * NETWORK-FIRST with a short timeout, deliberately — not stale-while-revalidate.
 * The app is a dozen ES modules that import each other by name. SWR can serve a
 * freshly-deployed module alongside a cached older one, and the mismatch shows
 * up as "does not provide an export named X" — a blank screen, on a course,
 * mid-round. Network-first guarantees the module set is internally consistent:
 * the live set when online, the last complete cached set when not.
 *
 * The timeout matters as much as the ordering: a bad-signal load that hangs on
 * the network is indistinguishable from being offline, so treat it as offline.
 */

// v10: rev 4, scramble quarantine, auto-lock 30. Bumped because the offline fallback is a whole module set, and an
// un-bumped cache would keep serving the previous set to a phone that loses
// signal mid-round — internally consistent, but the wrong build on a field-test
// day, and on this one it would be a build with no Radcliffe in it.
const CACHE = 'gt-shell-v10';
const NET_TIMEOUT_MS = 2500;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './css/themes.css',
  './css/base.css',
  './js/app.js',
  './js/util/geo.js',
  './js/util/stats.js',
  './js/data/schema.js',
  './js/data/store.js',
  './js/data/courses.js',
  './js/data/clubs.js',
  './js/data/revision.js',
  './js/data/trackstore.js',
  './js/gps/gps.js',
  './js/gps/wakelock.js',
  './js/round/round.js',
  './js/round/track-analysis.js',
  './js/analysis/tour-benchmark.js',
  './js/analysis/benchmarks.js',
  './js/analysis/strokes-gained.js',
  './js/analysis/trends.js',
  './js/ui/screen-trends.js',
  './js/ui/dom.js',
  './js/ui/lock.js',
  './js/ui/screen-home.js',
  './js/ui/screen-setup.js',
  './js/ui/screen-play.js',
  './js/ui/screen-summary.js',
  './js/ui/screen-history.js',
  './js/ui/screen-settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // Same reasoning as the fetch handler: prime the cache from the server,
      // not from whatever the browser happened to have lying around.
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  e.respondWith(
    (async () => {
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), NET_TIMEOUT_MS);
      });

      try {
        // `cache: 'no-cache'` is load-bearing, not belt-and-braces. A plain
        // fetch() inside a service worker still goes through the browser's HTTP
        // cache, so "network-first" would happily return a stale module that
        // the browser cached before the deploy — reintroducing the exact
        // mixed-module blank screen this strategy exists to prevent. no-cache
        // forces revalidation with the server, which is a cheap 304 when
        // nothing has changed.
        const networkRequest = fetch(request.url, {
          cache: 'no-cache',
          credentials: 'same-origin',
        });
        const res = await Promise.race([networkRequest, timeout]);
        clearTimeout(timer);
        if (res?.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        }
        if (res) return res; // a real 404 is information; don't mask it with a stale 200
      } catch {
        /* offline — fall through to the cache */
      }
      clearTimeout(timer);

      const cached = await caches.match(request);
      if (cached) return cached;
      // A navigation with nothing cached still deserves the app shell.
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    })()
  );
});
