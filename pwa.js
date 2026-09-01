/*
  Kanha Ji's Courtyard — PWA glue
  ================================
  Everything install/offline/update related lives here, deliberately
  separate from app.js, so none of the routing, chapter loading, ambience,
  journal, or progress-tracking logic is touched by the PWA conversion.
  This file only ever adds small, dismissible UI (banners, an install
  row in Settings) — it never changes existing markup or behavior.
*/
(function () {
  'use strict';

  /* ---------------- standalone-PWA viewport correction ----------------
     Installed-app-only counter-correction for a specific Chrome bug: if
     "Request desktop site" is (or ever was) turned on for this origin,
     Chrome can force the page's *layout* viewport to ~980px CSS px on an
     installed Android home-screen launch, regardless of the page's own
     <meta name="viewport">, and then auto-scale that 980px layout down to
     fit the real screen. The html.pwa-standalone mobile-lock rules in
     styles.css still apply correctly either way — they key off the class,
     never off width — but the whole page can end up rendering shrunk down
     to a fraction of its intended size, which looks exactly like "stuck in
     desktop mode" even though the mobile CSS is technically active.

     window.visualViewport.scale is Chrome's own report of that auto-fit
     ratio, so the fix is a counter-zoom of 1 / scale on the document root:
     the two multiply out to ~1, i.e. true physical size. `zoom` (not
     `transform: scale()`) is used deliberately — a transform on an
     ancestor creates a new containing block for anything position:fixed
     (nav, sound controls, Krishna's corner, the offline/update banners),
     which would silently stop tracking the real screen; `zoom` has no such
     side effect. This is self-correcting: once applied, Chrome's own
     auto-fit relaxes back toward 1:1, so the next recalculation (fired by
     resize/orientation listeners below) computes a target close to 1 —
     effectively a no-op from then on.

     Gated entirely on html.pwa-standalone (set synchronously in
     index.html's inline bootstrap script), so this is a complete no-op in
     every normal browser tab and in DevTools device emulation — neither
     ever carries that class — regardless of "Request desktop site" or any
     other Chrome setting. `zoom` is Chromium/WebKit-only and
     unstandardized, which is acceptable only because this path never runs
     outside the installed Android Chrome app. */
  function correctStandaloneViewportZoom() {
    if (!document.documentElement.classList.contains('pwa-standalone')) return;
    if (!window.visualViewport) return;
    function apply() {
      var scale = window.visualViewport.scale || 1;
      document.documentElement.style.zoom = (scale && Math.abs(scale - 1) > 0.02) ? String(1 / scale) : '';
    }
    apply();
    window.visualViewport.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
  }
  correctStandaloneViewportZoom();

  /* ---------------- offline banner ----------------
     A calm, ambient note — never a browser error, never demanding action. */
  function showOfflineBanner() {
    let bar = document.getElementById('pwaOfflineBanner');
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'pwaOfflineBanner';
    bar.className = 'pwa-banner pwa-offline-banner';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.innerHTML = '<span>The Courtyard is resting offline with you.</span>';
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('visible'));
  }
  function hideOfflineBanner() {
    const bar = document.getElementById('pwaOfflineBanner');
    if (!bar) return;
    bar.classList.remove('visible');
    setTimeout(() => bar.remove(), 400);
  }
  function syncOnlineStatus() {
    if (navigator.onLine) hideOfflineBanner();
    else showOfflineBanner();
  }
  window.addEventListener('online', syncOnlineStatus);
  window.addEventListener('offline', syncOnlineStatus);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncOnlineStatus);
  } else {
    syncOnlineStatus();
  }

  /* ---------------- install prompt ----------------
     Browsers already offer their own "Install" affordance once the
     manifest + service worker criteria are met; this just adds a quiet,
     optional row in Settings for anyone who'd rather tap something there.
     It only appears once the browser confirms installability, and hides
     itself again once installed. */
  let deferredInstallPrompt = null;

  function findOrCreateInstallRow() {
    let row = document.getElementById('pwaInstallRow');
    if (row) return row;
    const settingsCard = document.querySelector('#view-settings .card');
    if (!settingsCard) return null;
    row = document.createElement('div');
    row.className = 'setting-row';
    row.id = 'pwaInstallRow';
    row.style.display = 'none';
    row.innerHTML =
      '<div>' +
      '<div class="setting-label">Install the Courtyard</div>' +
      '<div class="setting-desc">Add it to your home screen for a calmer, full-screen way to return</div>' +
      '</div>' +
      '<button id="pwaInstallBtn" style="border-radius:0; padding:9px 18px; font-size:0.75rem; ' +
      'letter-spacing:0.08em; text-transform:uppercase; color:var(--ivory-dim); background:transparent; ' +
      'border:1px solid var(--line); cursor:pointer;">Install</button>';
    settingsCard.appendChild(row);
    row.querySelector('#pwaInstallBtn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } catch (e) {
        /* ignore */
      }
      deferredInstallPrompt = null;
      row.style.display = 'none';
    });
    return row;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const row = findOrCreateInstallRow();
    if (row) row.style.display = '';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const row = document.getElementById('pwaInstallRow');
    if (row) row.style.display = 'none';
  });

  /* ---------------- service worker + gentle update banner ---------------- */
  if (!('serviceWorker' in navigator)) return;

  function showUpdateBanner(registration) {
    if (document.getElementById('pwaUpdateBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'pwaUpdateBanner';
    bar.className = 'pwa-banner pwa-update-banner';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span>A newer version of the Courtyard is ready.</span>' +
      '<div class="pwa-banner-actions">' +
      '<button type="button" class="pwa-banner-btn pwa-banner-btn-primary" id="pwaRefreshBtn">Refresh Now</button>' +
      '<button type="button" class="pwa-banner-btn" id="pwaLaterBtn">Later</button>' +
      '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('visible'));

    bar.querySelector('#pwaRefreshBtn').addEventListener('click', () => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      bar.remove();
    });
    bar.querySelector('#pwaLaterBtn').addEventListener('click', () => {
      bar.classList.remove('visible');
      setTimeout(() => bar.remove(), 400);
      // "Later" only dismisses this session's banner — the update is never
      // forced, and the same waiting worker will offer again next visit.
    });
  }

  let refreshingAfterUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingAfterUpdate) return;
    refreshingAfterUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      navigator.serviceWorker
  .register('service-worker.js', {
    updateViaCache: 'none'
  })
  .then((registration) => {
    registration.update();
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(registration);
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(registration);
            }
          });
        });
      })
      .catch(() => {
        /* offline-first is a progressive enhancement — the app already
           works without a service worker, just without offline support */
      });
  });
})();
