/*
  Kanha Ji's Courtyard — installed-app mode flag
  =================================================
  This file decides whether the page was opened as the installed PWA and,
  if so, adds two things to <html>:

  1. class "courtyard-app-mode" — as before, set whenever EITHER of two
     independent signals says "this is the installed app":
       a) the explicit ?app=1 flag on load, or the sessionStorage copy of
          it — carried over from courtyard-app.html, the manifest's
          start_url
       b) matchMedia('(display-mode: standalone)') — Phase 1's diagnostic
          proved this is reliably YES for the installed app on Android
          regardless of how it was launched, so it is now used as a
          second, independent signal rather than a replacement for (a).
          This is what keeps app-mode working even if a stale installed
          shortcut ever bypasses courtyard-app.html again and opens
          index.html directly — exactly the failure Phase 1 caught (the
          installed app was still pointed at an old start_url, so
          courtyard-app.html never ran and neither the query flag nor
          the sessionStorage flag was ever set).

  2. (Phase 2) class "courtyard-viewport-wide" plus the custom property
     --courtyard-viewport-scale — set only when Chrome's per-origin
     "Desktop site" toggle is forcing a much wider layout viewport than
     the physical screen (Phase 1 proved: innerWidth jumps to ~980 while
     screen.width stays ~412, with visualViewport matching innerWidth —
     i.e. the whole page is being rendered at roughly screen.width /
     innerWidth scale). courtyard-app.css uses --courtyard-viewport-scale
     to size type and spacing back up by that same measured ratio, which
     mathematically reproduces the same physical result as the already-
     correct ~411px viewport, just expressed in bigger CSS px to match
     the wider viewport Chrome is reporting. The ratio is always measured
     live from screen.width / innerWidth — never a hardcoded phone width
     — and is re-measured on resize/orientation change in case Desktop
     Site is toggled mid-session.

  Deliberately does NOT use navigator.userAgent or pointer/hover media
  queries for app-mode detection — those are what proved unreliable for
  telling the installed app apart from Chrome's "Desktop site" rendering
  of the same page.

  Loaded and runs before app.js; touches nothing app.js owns. When
  neither app-mode signal fires, this file does nothing at all — no
  class, no DOM changes, no side effects — and courtyard-app.css has
  nothing to match against, so the normal website is unaffected by any
  of this.
*/
(function () {
  'use strict';

  var APP_MODE_KEY = 'courtyardAppMode';
  var WIDE_CLASS = 'courtyard-viewport-wide';
  var SCALE_PROP = '--courtyard-viewport-scale';
  var WIDE_RATIO_THRESHOLD = 1.3; // meaningfully wider than the real screen
  var MAX_SCALE = 3;              // sanity clamp — never trust an extreme reading

  function detectAppMode() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('app') === '1') {
        // Persist for this tab/session only, so if the SPA ever reloads or
        // navigates in a way that drops the query string mid-session, the
        // installed app doesn't fall back to the website presentation.
        try { sessionStorage.setItem(APP_MODE_KEY, '1'); } catch (e) { /* ignore */ }
        return true;
      }
    } catch (e) { /* ignore */ }

    try {
      if (sessionStorage.getItem(APP_MODE_KEY) === '1') return true;
    } catch (e) { /* ignore */ }

    // Second, independent signal — see file header. Catches the installed
    // app even if it launched straight into index.html without ever
    // running courtyard-app.html's redirect.
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) { /* ignore */ }
    try {
      if (window.navigator && window.navigator.standalone === true) return true; // iOS
    } catch (e) { /* ignore */ }

    return false;
  }

  var isAppMode = detectAppMode();
  if (!isAppMode) return; // normal website: safely do nothing

  document.documentElement.classList.add('courtyard-app-mode');

  // Chrome can carry a per-origin "Desktop site" preference into the
  // installed, standalone-display PWA, which forces a wide layout
  // viewport regardless of this page's own <meta name="viewport"> tag.
  // Re-writing that tag's content after the override has already applied
  // gets some Chrome versions to recompute the layout viewport against
  // the real device width. Where it doesn't, the measurement/CSS below is
  // the actual guarantee either way.
  try {
    var viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
      );
    }
  } catch (e) { /* ignore */ }

  /* ---------------- Phase 2: measure and compensate ----------------
     screen.width stays tied to the physical device regardless of Desktop
     Site; window.innerWidth is what Chrome swaps to ~980 when Desktop
     Site is on. Their ratio is exactly the factor courtyard-app.css needs
     to scale type/spacing back up by, and it self-corrects for any
     device — nothing here assumes a specific phone width. */
  function updateViewportScale() {
    var screenWidth = (window.screen && window.screen.width) || 0;
    var innerWidth = window.innerWidth || 0;
    var ratio = 1;

    if (screenWidth > 0 && innerWidth > 0) {
      ratio = innerWidth / screenWidth;
    }
    if (!isFinite(ratio) || ratio < 1) ratio = 1;
    if (ratio > MAX_SCALE) ratio = MAX_SCALE;

    var root = document.documentElement;
    if (ratio >= WIDE_RATIO_THRESHOLD) {
      root.classList.add(WIDE_CLASS);
      root.style.setProperty(SCALE_PROP, ratio.toFixed(3));
    } else {
      root.classList.remove(WIDE_CLASS);
      root.style.setProperty(SCALE_PROP, '1');
    }
  }

  updateViewportScale();

  // Desktop Site can be flipped without the app being relaunched, and
  // rotating/folding a device changes these numbers too — re-measure
  // rather than trusting only the value taken at first load.
  var resizeTimer = null;
  function scheduleUpdate() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateViewportScale, 150);
  }
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('orientationchange', scheduleUpdate);
})();
