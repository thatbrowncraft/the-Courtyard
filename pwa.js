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

  /* ---------------- standalone-PWA width correction: REMOVED (Session 30) ----------------
     A previous session added a JS fix here that read
     window.visualViewport.scale and, when it deviated from 1, applied a
     counter-`zoom` on <html> plus a JS-measured `--true-vw` custom
     property for styles.css to lock body's width to.

     On-device testing (this session) showed that mechanism was the
     actual cause of the "content squeezed to the left, dead space on the
     right" bug, not a fix for it: the debug badge captured
     visualViewport.scale: 0.25, applied zoom (fix): 4, and
     innerWidth: 1646 — 1646 is ~4x the device's real 412px width, i.e.
     exactly the zoom factor the fix had just applied. Setting
     `document.documentElement.style.zoom` fed back into the very
     visualViewport reading the code used to decide how much zoom to
     apply, so it never actually converged on 1 — it just kept
     re-asserting a 4x correction against a problem it was itself
     causing.

     Rather than patch that loop with another zoom/scale value (which
     would just be a different guess at the same fragile mechanism), the
     fix is now pure CSS and never depends on measuring scale at all —
     see the html.pwa-standalone rules in styles.css. That approach can't
     self-reinforce the way a JS-measured zoom loop can, because it never
     reads back a value it just wrote. */

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

  /* ---------------- TEMPORARY: PWA detection debug badge ----------------
     Exists only to answer, directly off the installed phone, exactly what
     index.html's bootstrap script detected — there's no laptop/DevTools in
     this workflow, so this is the only way to see it. Tap the badge to
     expand it, screenshot it, done — then delete this whole block (down to
     the matching end-comment below) once the mobile-lock is confirmed
     working. It never affects layout or behavior either way. */
  function mountPwaDebugBadge() {
    var badge = document.createElement('div');
    badge.id = 'courtyardPwaDebug';
    badge.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);left:8px;z-index:99999;background:rgba(20,16,12,0.94);color:#fff;font-family:monospace;font-size:11px;line-height:1.5;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.4);max-width:92vw;';
    var open = false;
    function sessionRaw() {
      try { return sessionStorage.getItem('courtyard:pwa-session'); } catch (e) { return 'ERR: ' + e.message; }
    }
    function render() {
      var hasClass = document.documentElement.classList.contains('pwa-standalone');
      var rows = [
        ['display-mode standalone', window.matchMedia('(display-mode: standalone)').matches],
        ['ios navigator.standalone', navigator.standalone === true],
        ['window.__COURTYARD_PWA_SESSION__', window.__COURTYARD_PWA_SESSION__],
        ['sessionStorage raw', sessionRaw()],
        ['html.pwa-standalone class', hasClass],
        ['location.search', location.search || '(empty)'],
        ['location.href', location.href],
        ['innerWidth', window.innerWidth],
        ['visualViewport.width', window.visualViewport ? window.visualViewport.width : 'n/a'],
        ['visualViewport.scale', window.visualViewport ? window.visualViewport.scale : 'n/a'],
        ['screen.width', window.screen ? window.screen.width : 'n/a'],
        ['devicePixelRatio', window.devicePixelRatio || 'n/a'],
        ['--pwa-device-width', getComputedStyle(document.documentElement).getPropertyValue('--pwa-device-width') || '(unset)'],
        ['html computed width', document.documentElement.getBoundingClientRect().width],
        ['body computed width', document.body.getBoundingClientRect().width]
      ];
      var lines = open
        ? rows.map(function (r) { return '<div>' + r[0] + ': ' + r[1] + '</div>'; }).join('')
        : '';
      badge.innerHTML =
        '<button type="button" style="display:block;width:100%;padding:6px 10px;background:transparent;color:' +
        (hasClass ? '#9bbf7e' : '#e0a0ad') +
        ';border:none;font-family:monospace;font-size:11px;font-weight:700;text-align:left;">PWA: ' +
        (hasClass ? 'STANDALONE DETECTED' : 'NOT DETECTED') + ' ' + (open ? '\u25B2' : '\u25BC') + '</button>' +
        (open ? '<div style="padding:0 10px 10px 10px;word-break:break-all;">' + lines + '</div>' : '');
    }
    badge.addEventListener('click', function () { open = !open; render(); });
    render();
    document.body.appendChild(badge);
  }
  mountPwaDebugBadge();
  /* ---------------- end TEMPORARY debug badge ---------------- */
})();
