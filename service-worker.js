/*
  Kanha Ji's Courtyard — service worker
  ======================================
  This file is intentionally separate from app.js and never touches
  routing, chapter loading, ambience playback, or any rendering logic.
  It only decides what gets cached and when a cached copy is served.

  --- Versioning (bump this on every deploy) -------------------------------
  CACHE_VERSION controls the *app-shell* and *data* caches below. Bump it
  any time index.html, styles.css, app.js, pwa.js, config.json, the chapter
  manifest, or the icon set change — the same spirit as bumping
  config.json's "version" field, just for the cache layer. On activation,
  any old versioned cache is deleted automatically; nothing manual needed
  beyond changing this string.

  The ambience audio cache is deliberately NOT tied to this version — MP3s
  are large, rarely change, and re-downloading all of them on every deploy
  would go against "avoid unnecessary downloads." An ambience file is only
  ever re-fetched if its filename changes, or if someone clears site data.
*/
const CACHE_VERSION = 'v1';

const PRECACHE = `courtyard-shell-${CACHE_VERSION}`;
const DATA_CACHE = `courtyard-data-${CACHE_VERSION}`;
const FONT_CACHE = 'courtyard-fonts'; // fonts almost never change; keep across versions
const AUDIO_CACHE = 'courtyard-audio'; // see note above — persists across versions

// Every cache name this version of the worker is allowed to keep around.
// Anything else found on activate() is a leftover from an older version
// and gets removed.
const CURRENT_CACHES = new Set([PRECACHE, DATA_CACHE, FONT_CACHE, AUDIO_CACHE]);

// App-shell files precached on install. Deliberately excludes:
//  - individual chapter files (data/chapter-NN.json) — lazy, cached on open
//  - ambience MP3s — lazy, cached on first play
//  - assets/images/* — currently unused, cached on demand if that changes
const PRECACHE_URLS = [
  'index.html',
  'styles.css',
  'app.js',
  'pwa.js',
  'manifest.webmanifest',
  'config.json',
  'data/chapters.json',
  'assets/audio/audio.json',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-192.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/favicon-32.png',
  'assets/icons/favicon-16.png',
];

function resolveScoped(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // Precache one at a time and shrug off any single failure (e.g. an
      // icon not uploaded yet) rather than aborting the whole install —
      // the app already tolerates missing assets gracefully, and the
      // service worker should be just as forgiving.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const req = new Request(resolveScoped(url), { cache: 'reload' });
            const res = await fetch(req);
            if (res && res.ok) await cache.put(req, res);
          } catch (e) {
            /* quietly skip — this file just won't be available offline yet */
          }
        })
      );
      // Does not call skipWaiting() here on purpose — activation of a new
      // version waits for the person to tap "Refresh Now" (see pwa.js),
      // so an install never yanks the app out from under someone reading.
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !CURRENT_CACHES.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// The "Refresh Now" button in pwa.js posts this so the waiting worker can
// take over immediately — updates are never forced without that tap.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---------------- helpers ---------------- */

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isGoogleFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

function isAppDataRequest(url) {
  if (!isSameOrigin(url)) return false;
  return (
    url.pathname.includes('/data/') ||
    /\/config\.json$/.test(url.pathname) ||
    /\/assets\/audio\/audio\.json$/.test(url.pathname)
  );
}

function isAmbienceAudioRequest(url) {
  return isSameOrigin(url) && url.pathname.includes('/assets/audio/') && /\.mp3$/i.test(url.pathname);
}

function isImageRequest(url) {
  return isSameOrigin(url) && url.pathname.includes('/assets/images/');
}

const PRECACHE_URL_SET = new Set(PRECACHE_URLS.map(resolveScoped));

/* ---------------- range-aware audio caching ----------------
   <audio> playback commonly issues byte-range requests (e.g. "bytes=0-")
   even on first play, which the Cache API can't store directly as partial
   responses. So: the *first* time an ambience is requested, fetch the
   whole file (ignoring any Range header) and cache that full response.
   Every request after that — including range requests, and including
   fully offline ones — is served by slicing the cached full response,
   so playback, seeking, and looping all keep working without the network. */
async function handleAmbienceAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cacheKey = request.url; // ignore method/headers/range for the lookup key
  let fullResponse = await cache.match(cacheKey);

  if (!fullResponse) {
    try {
      // Deliberately drop any Range header so we always fetch (and cache) the
      // complete file the first time it's actually played.
      const fullReq = new Request(request.url, { headers: {}, mode: 'same-origin' });
      const networkResponse = await fetch(fullReq);
      if (!networkResponse || !networkResponse.ok) return networkResponse;
      await cache.put(cacheKey, networkResponse.clone());
      fullResponse = networkResponse;
    } catch (e) {
      return new Response(null, { status: 504, statusText: 'Ambience unavailable offline' });
    }
  }

  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return fullResponse.clone();

  const buffer = await fullResponse.clone().arrayBuffer();
  const total = buffer.byteLength;
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : total - 1;
  if (isNaN(start) || start < 0) start = 0;
  if (isNaN(end) || end > total - 1) end = total - 1;
  if (start > end) start = 0;

  const slice = buffer.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': fullResponse.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(slice.byteLength),
      'Accept-Ranges': 'bytes',
    },
  });
}

/* ---------------- fetch routing ---------------- */

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // never intercept writes

  const url = new URL(request.url);

  // App-shell navigations (page loads / refreshes) — always serve the
  // cached shell so a refresh works offline; the update banner (pwa.js)
  // is what tells the person a newer shell is ready, never a silent swap.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(PRECACHE);
          const cached = await cache.match(resolveScoped('index.html'));
          if (cached) return cached;
          return await fetch(request);
        } catch (e) {
          const cache = await caches.open(PRECACHE);
          const cached = await cache.match(resolveScoped('index.html'));
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Kanha Ji\'s Courtyard</title>' +
              '<body style="background:#160F0A;color:#F6E9CE;font-family:Georgia,serif;' +
              'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">' +
              '<p>The Courtyard is resting offline with you.</p></body>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }

  if (isAmbienceAudioRequest(url)) {
    event.respondWith(handleAmbienceAudio(request));
    return;
  }

  if (isGoogleFontRequest(url)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (isAppDataRequest(url)) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  if (isImageRequest(url)) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  if (isSameOrigin(url) && PRECACHE_URL_SET.has(request.url)) {
    event.respondWith(cacheFirst(request, PRECACHE));
    return;
  }

  // Anything else same-origin: try cache, then network, so nothing new
  // ever throws an uncaught offline error to the page.
  if (isSameOrigin(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch (e) {
          return new Response(null, { status: 504 });
        }
      })()
    );
  }
});
